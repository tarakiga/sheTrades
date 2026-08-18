/**
 * Admin management for issued certificates.
 *
 * The operator jobs this exists for: correct a name a learner typed badly,
 * withdraw a certificate that should not have been issued, re-send one that
 * never arrived, and issue one by hand for someone the automatic path missed.
 *
 * Two of those look similar and are not. CORRECTING a name edits the row and
 * keeps its publicId, because the learner has already shared that link.
 * RE-ISSUING would mean a new snapshot and a new credential, and nothing here
 * does that.
 */
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../admin/prisma.js";
import { authenticateJwt, requireRoles } from "../auth/jwt-rbac.js";
import { sendWhatsAppOutreach } from "../whatsapp/sender.js";
import {
  getRuntimeCertificateTemplate,
  getRuntimeCertificateTemplateVersion
} from "../config-platform/runtime-config.js";
import { sanitiseLearnerName } from "./core.js";
import {
  buildCertificateCaption,
  buildIssuePlan,
  certificateUrls,
  issueCertificate
} from "./service.js";

const requireWriteAccess = requireRoles(["editor", "admin"]);

/**
 * The operator-facing shape. Deliberately NOT the whole row: an operator
 * needs to know whose certificate this is and whether it is valid, and
 * nothing here needs her phone number. Enforced by this select rather than by
 * remembering to strip fields at each call site.
 */
const LIST_SELECT = {
  id: true,
  publicId: true,
  userId: true,
  learnerName: true,
  programmeName: true,
  issuedAt: true,
  revokedAt: true,
  revokedReason: true
} as const;

const listQuerySchema = z.object({
  search: z.string().trim().max(120).optional(),
  status: z.enum(["issued", "revoked"]).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25)
});

const idParamsSchema = z.object({ id: z.string().min(1) });
const renameBodySchema = z.object({ learnerName: z.string().min(1).max(200) });
const revokeBodySchema = z.object({ reason: z.string().trim().min(1).max(500) });
const manualIssueBodySchema = z.object({
  userId: z.string().min(1),
  learnerName: z.string().min(1).max(200)
});

type Actor = { id: string | null; role: string | null };

function actorOf(req: { authUser?: { id?: string; role?: string } | undefined }): Actor {
  return { id: req.authUser?.id ?? null, role: req.authUser?.role ?? null };
}

function logAction(action: string, certificateId: string, actor: Actor, extra: Record<string, unknown> = {}) {
  console.log(
    JSON.stringify({
      event: "certificate.admin_action",
      action,
      certificateId,
      actorId: actor.id,
      actorRole: actor.role,
      updatedAt: new Date().toISOString(),
      ...extra
    })
  );
}

function publicBaseUrl(): string {
  return (process.env.PUBLIC_BASE_URL ?? "").replace(/\/+$/, "");
}

/**
 * Injectable so the routes can be exercised without a database. Mirrors the
 * seam `routes-public.ts` uses for the same reason.
 */
export type ResendTarget = { id: string; publicId: string; user: { phone: string } };

export type CertificateAdminDeps = {
  sendImage: typeof sendWhatsAppOutreach;
  issue: typeof issueCertificate;
  /** The resend lookup, injectable so the "a resend never issues" property can
   * be asserted past the auth guard rather than in front of it. */
  findForResend: (id: string) => Promise<ResendTarget | null>;
};

export function createCertificateAdminRouter(
  overrides: Partial<CertificateAdminDeps> = {}
): Router {
  const deps: CertificateAdminDeps = {
    sendImage: overrides.sendImage ?? sendWhatsAppOutreach,
    issue: overrides.issue ?? issueCertificate,
    findForResend:
      overrides.findForResend ??
      ((id) =>
        prisma.certificate.findUnique({
          where: { id },
          // learnerPhone is not on this table - the learner is, so read her
          // phone from her own record rather than duplicating it here.
          select: { id: true, publicId: true, user: { select: { phone: true } } }
        }))
  };

  const router = Router();
  router.use(authenticateJwt);

  router.get("/certificates", async (req, res, next) => {
    try {
      const query = listQuerySchema.parse(req.query);
      const where = {
        ...(query.search ? { learnerName: { contains: query.search, mode: "insensitive" as const } } : {}),
        ...(query.status === "revoked" ? { revokedAt: { not: null } } : {}),
        ...(query.status === "issued" ? { revokedAt: null } : {})
      };
      const [items, total] = await Promise.all([
        prisma.certificate.findMany({
          where,
          select: LIST_SELECT,
          orderBy: { issuedAt: "desc" },
          skip: (query.page - 1) * query.pageSize,
          take: query.pageSize
        }),
        prisma.certificate.count({ where })
      ]);
      res.status(200).json({ items, total, page: query.page, pageSize: query.pageSize });
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ message: error.issues[0]?.message ?? "Invalid request" });
        return;
      }
      next(error);
    }
  });

  router.get("/certificates/:id", async (req, res, next) => {
    try {
      const { id } = idParamsSchema.parse(req.params);
      const row = await prisma.certificate.findUnique({ where: { id }, select: LIST_SELECT });
      if (!row) {
        res.status(404).json({ message: "Certificate not found" });
        return;
      }
      res.status(200).json({ certificate: row, urls: certificateUrls(publicBaseUrl(), row.publicId) });
    } catch (error) {
      next(error);
    }
  });

  router.patch("/certificates/:id", requireWriteAccess, async (req, res, next) => {
    try {
      const { id } = idParamsSchema.parse(req.params);
      const body = renameBodySchema.parse(req.body);
      const cleaned = sanitiseLearnerName(body.learnerName);
      if (!cleaned.ok) {
        res.status(400).json({
          message:
            cleaned.reason === "too_long"
              ? "That name is too long to fit the certificate. Use 60 characters or fewer."
              : "Enter the name that should appear on the certificate."
        });
        return;
      }
      const existing = await prisma.certificate.findUnique({ where: { id }, select: { id: true } });
      if (!existing) {
        res.status(404).json({ message: "Certificate not found" });
        return;
      }
      // Only the printed name changes. publicId stays, because the learner has
      // already shared that link and a typo fix must not break it; and
      // templateSnapshot stays, because correcting a name is not a re-issue -
      // the artwork this credential was granted under does not change.
      const updated = await prisma.certificate.update({
        where: { id },
        data: { learnerName: cleaned.value },
        select: LIST_SELECT
      });
      logAction("rename", id, actorOf(req), { learnerName: cleaned.value });
      res.status(200).json({ certificate: updated });
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ message: error.issues[0]?.message ?? "Invalid request" });
        return;
      }
      next(error);
    }
  });

  router.post("/certificates/:id/revoke", requireWriteAccess, async (req, res, next) => {
    try {
      const { id } = idParamsSchema.parse(req.params);
      const body = revokeBodySchema.parse(req.body);
      const actor = actorOf(req);
      const existing = await prisma.certificate.findUnique({ where: { id }, select: { id: true } });
      if (!existing) {
        res.status(404).json({ message: "Certificate not found" });
        return;
      }
      // Revocation is the intended way to withdraw a certificate - stated on
      // the public page, and reversible. Unpublishing the template is not.
      const updated = await prisma.certificate.update({
        where: { id },
        data: { revokedAt: new Date(), revokedReason: body.reason, revokedBy: actor.id },
        select: LIST_SELECT
      });
      logAction("revoke", id, actor, { reason: body.reason });
      res.status(200).json({ certificate: updated });
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ message: error.issues[0]?.message ?? "Invalid request" });
        return;
      }
      next(error);
    }
  });

  router.post("/certificates/:id/unrevoke", requireWriteAccess, async (req, res, next) => {
    try {
      const { id } = idParamsSchema.parse(req.params);
      const existing = await prisma.certificate.findUnique({ where: { id }, select: { id: true } });
      if (!existing) {
        res.status(404).json({ message: "Certificate not found" });
        return;
      }
      const updated = await prisma.certificate.update({
        where: { id },
        data: { revokedAt: null, revokedReason: null, revokedBy: null },
        select: LIST_SELECT
      });
      logAction("unrevoke", id, actorOf(req));
      res.status(200).json({ certificate: updated });
    } catch (error) {
      next(error);
    }
  });

  router.post("/certificates/:id/resend", requireWriteAccess, async (req, res, next) => {
    try {
      const { id } = idParamsSchema.parse(req.params);
      const row = await deps.findForResend(id);
      if (!row) {
        res.status(404).json({ message: "Certificate not found" });
        return;
      }
      // Deliberately NOT via issueCertificate. A resend must keep working after
      // an admin disables or redesigns the live template - the public route
      // renders from the row's own frozen snapshot, so the image is still
      // there, and routing this through the issuing path would let the enabled
      // flag break resends for people who already hold a certificate.
      const urls = certificateUrls(publicBaseUrl(), row.publicId);
      const template = getRuntimeCertificateTemplate();
      const copy = template ? `Here is your certificate from ${template.issuerName}.` : "Here is your certificate.";
      const result = await deps.sendImage(row.user.phone, {
        kind: "image",
        link: urls.image,
        caption: buildCertificateCaption(copy, urls.verify)
      });
      logAction("resend", id, actorOf(req), { sent: result.status === "sent" });
      if (result.status === "failed") {
        res.status(502).json({ message: `Could not send: ${result.reason}` });
        return;
      }
      res.status(200).json({ message: "Certificate re-sent." });
    } catch (error) {
      next(error);
    }
  });

  router.post("/certificates", requireWriteAccess, async (req, res, next) => {
    try {
      const body = manualIssueBodySchema.parse(req.body);
      const cleaned = sanitiseLearnerName(body.learnerName);
      if (!cleaned.ok) {
        res.status(400).json({
          message:
            cleaned.reason === "too_long"
              ? "That name is too long to fit the certificate. Use 60 characters or fewer."
              : "Enter the name that should appear on the certificate."
        });
        return;
      }
      const user = await prisma.user.findUnique({
        where: { id: body.userId },
        select: { id: true, phone: true }
      });
      if (!user) {
        res.status(404).json({ message: "Learner not found" });
        return;
      }
      const template = getRuntimeCertificateTemplate();
      if (!template) {
        res.status(409).json({ message: "No certificate template is published." });
        return;
      }
      // Through the same gate the bot uses, so a manual issue cannot bypass the
      // enabled flag or skip the template snapshot.
      const plan = buildIssuePlan({
        template,
        templateVersion: getRuntimeCertificateTemplateVersion(),
        learnerName: cleaned.value,
        completion: { completedModules: 1, totalModules: 1 }
      });
      if (!plan) {
        res.status(409).json({
          message:
            "Certificates are switched off in the template. Publish it with enabled: true first."
        });
        return;
      }
      const outcome = await deps.issue({
        userId: user.id,
        learnerPhone: user.phone,
        plan,
        baseUrl: publicBaseUrl(),
        caption: `Here is your certificate from ${template.issuerName}.`
      });
      if (outcome.status === "failed") {
        // No publicId is invented here: a failed outcome means nothing was
        // persisted, and reporting an id would point the operator at a 404.
        logAction("manual_issue_failed", "(none)", actorOf(req), { reason: outcome.reason });
        res.status(500).json({ message: `Could not issue: ${outcome.reason}` });
        return;
      }
      logAction("manual_issue", outcome.publicId, actorOf(req), { sent: outcome.sent });
      res.status(201).json({ publicId: outcome.publicId, sent: outcome.sent });
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ message: error.issues[0]?.message ?? "Invalid request" });
        return;
      }
      next(error);
    }
  });

  return router;
}

export const certificateAdminRouter = createCertificateAdminRouter();
