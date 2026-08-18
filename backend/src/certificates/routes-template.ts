/**
 * The certificate template document, as an editable thing.
 *
 * Phase 1 gave the template a single on/off switch and nothing else: to change
 * the artwork or move the learner's name you edited a TypeScript file, re-ran a
 * seed and republished by hand. This module is the rest of it — read the draft,
 * save the draft, preview it, publish it, look at what changed, roll it back.
 *
 * Every write still goes through the config platform's draft-then-publish path,
 * so the editor inherits version history, audit entries and rollback rather
 * than inventing storage of its own. Nothing here writes to config_versions
 * directly, and nothing here is a side door around the publish boundary.
 *
 * Two things this module is careful about:
 *
 *   - A DRAFT IS VALIDATED AGAINST REALITY, not just against its schema. A
 *     payload can be perfectly shaped and still name artwork that does not
 *     exist, and the consequence of that lands on a learner's certificate as a
 *     500 at render time. So asset keys are checked when the draft is saved,
 *     which is where it is cheap to say so.
 *
 *   - THE PREVIEW IS THE REAL RENDERER. Not an HTML approximation of it. See
 *     the note on the preview route.
 */
import { Router, type Request } from "express";
import sharp from "sharp";
import { z } from "zod";
import { prisma } from "../admin/prisma.js";
import { authenticateJwt, requireRoles } from "../auth/jwt-rbac.js";
import { getConfigPlatformService } from "../config-platform/service.js";
import { refreshRuntimeConfigCache } from "../config-platform/runtime-config.js";
import { loadAssetFromDb } from "./assets.js";
import { certificateTemplatePayloadSchema, type CertificateTemplatePayload } from "./contracts.js";
import { CERTIFICATE_PREVIEW_SAMPLES, findPreviewSample } from "./preview-samples.js";
import { renderCertificatePng } from "./render.js";
import { CERTIFICATE_TEMPLATE_KEY } from "./service.js";
import { buildStarterTemplate } from "./template-starter.js";

const configService = getConfigPlatformService();

const requireWriteAccess = requireRoles(["editor", "admin"]);
/** Publishing matches the generic config platform: editors author, admins
 * publish. A published certificate template is what the next learner to finish
 * receives. */
const requirePublishAccess = requireRoles(["admin"]);

/**
 * How wide the preview PNG comes back.
 *
 * The render happens at the template's real canvas size and is then resized
 * DOWN for transport. Resizing a finished raster cannot move anything relative
 * to anything else, so this is still, precisely, the image a learner would get
 * — just smaller down the wire than a 2048px PNG on every drag.
 */
const PREVIEW_WIDTH = 1400;

/**
 * A realistic stand-in for the certificate id.
 *
 * Not "PREVIEW". Real ids are 32 base32 characters, and a preview that draws a
 * seven-character placeholder would let someone position and size that field
 * against a string a quarter of its true width — the error only shows up on a
 * real certificate, after issuing.
 */
const PREVIEW_CERTIFICATE_ID = "K7QF3MZP2XVA9TLD6BNR4WCH8JYE5SGU";

const draftBodySchema = z.object({
  payload: z.unknown(),
  changeSummary: z.string().trim().max(300).optional()
});
const publishBodySchema = z.object({
  expectedDraftVersionId: z.string().min(1),
  publishNote: z.string().trim().max(300).optional()
});
const rollbackBodySchema = z.object({
  targetVersionId: z.string().min(1),
  rollbackReason: z.string().trim().max(300).optional()
});
const createBodySchema = z.object({
  assetKey: z.string().min(1).max(64),
  programmeName: z.string().trim().min(1).max(120),
  issuerName: z.string().trim().min(1).max(120)
});
const previewBodySchema = z.object({
  payload: z.unknown(),
  sampleId: z.string().trim().max(40).optional()
});
const enabledBodySchema = z.object({ enabled: z.boolean() });

export type CertificateTemplateDeps = {
  /** Whether a key exists in certificate_assets. Injected so the
   * dangling-artwork rule can be tested without a database. */
  assetExists: (key: string) => Promise<boolean>;
  /** The background's true pixel size, used to set a new template's canvas. */
  assetSize: (key: string) => Promise<{ width: number; height: number } | null>;
  renderPng: typeof renderCertificatePng;
  refreshCache: () => Promise<void>;
};

const defaultDeps: CertificateTemplateDeps = {
  assetExists: async (key) => {
    const row = await prisma.certificateAsset.findUnique({ where: { key }, select: { key: true } });
    return row !== null;
  },
  assetSize: async (key) => {
    const row = await prisma.certificateAsset.findUnique({
      where: { key },
      select: { width: true, height: true }
    });
    return row ? { width: row.width, height: row.height } : null;
  },
  renderPng: renderCertificatePng,
  refreshCache: refreshRuntimeConfigCache
};

type Actor = { id: string; role: "admin" | "editor" | "viewer" };

function actorOf(req: Request): Actor {
  return {
    id: req.auth?.sub ?? "unknown",
    role: (req.auth?.role as Actor["role"] | undefined) ?? "viewer"
  };
}

function logTemplateAction(action: string, req: Request, extra: Record<string, unknown> = {}) {
  console.log(
    JSON.stringify({
      event: "certificate.template_action",
      action,
      actorId: req.auth?.sub ?? null,
      actorRole: req.auth?.role ?? null,
      updatedAt: new Date().toISOString(),
      ...extra
    })
  );
}

function publicBaseUrl(): string {
  return (process.env.PUBLIC_BASE_URL ?? "").replace(/\/+$/, "");
}

/**
 * The template document, or null when it has never been created.
 *
 * The service throws for a missing document rather than returning null, which
 * is the right shape for a caller that requires one and the wrong shape here:
 * "no template yet" is an ordinary state this editor exists to get out of.
 */
async function findTemplateDocument() {
  try {
    return await configService.getDocumentByNamespaceKey("integration", CERTIFICATE_TEMPLATE_KEY);
  } catch {
    return null;
  }
}

/** Parses a payload the client sent, reporting the first problem in the terms
 * an admin can act on rather than as a zod dump. */
function parseTemplatePayload(
  value: unknown
): { ok: true; payload: CertificateTemplatePayload } | { ok: false; message: string } {
  const parsed = certificateTemplatePayloadSchema.safeParse(value);
  if (parsed.success) return { ok: true, payload: parsed.data };
  const issue = parsed.error.issues[0];
  const where = issue?.path.join(".") ?? "";
  return {
    ok: false,
    message: where ? `${where}: ${issue?.message ?? "is not valid"}` : (issue?.message ?? "The template is not valid.")
  };
}

/** Every asset key a payload depends on: the background plus each image
 * field's own. */
export function referencedAssetKeys(payload: CertificateTemplatePayload): string[] {
  const keys = new Set<string>([payload.assetKey]);
  for (const field of payload.fields) {
    if ("assetKey" in field && field.assetKey) keys.add(field.assetKey);
  }
  return [...keys];
}

export function createCertificateTemplateRouter(
  overrides: Partial<CertificateTemplateDeps> = {}
): Router {
  const deps: CertificateTemplateDeps = { ...defaultDeps, ...overrides };
  const router = Router();
  router.use(authenticateJwt);

  /** Rejects a payload naming artwork that is not there. Done at save time
   * because the alternative is discovering it when a learner's certificate
   * fails to render. */
  async function missingAssets(payload: CertificateTemplatePayload): Promise<string[]> {
    const keys = referencedAssetKeys(payload);
    const present = await Promise.all(keys.map((key) => deps.assetExists(key)));
    return keys.filter((_key, index) => !present[index]);
  }

  // ---------------------------------------------------------------- status

  router.get("/certificates-template", async (_req, res, next) => {
    try {
      const found = await findTemplateDocument();
      if (!found?.published) {
        res.status(200).json({ published: false });
        return;
      }
      const parsed = certificateTemplatePayloadSchema.safeParse(found.published.payload);
      if (!parsed.success) {
        res.status(200).json({ published: true, valid: false });
        return;
      }
      res.status(200).json({
        published: true,
        valid: true,
        enabled: parsed.data.enabled,
        programmeName: parsed.data.programmeName,
        issuerName: parsed.data.issuerName,
        version: found.published.versionNumber
      });
    } catch (error) {
      next(error);
    }
  });

  /**
   * The on/off switch, as its own endpoint rather than a template edit.
   *
   * Flipping this is the single act that starts issuing permanent credentials,
   * so it stays separate from the layout editor: someone adjusting a font size
   * should not be able to start issuing as a side effect of saving.
   */
  router.post("/certificates-template/enabled", requirePublishAccess, async (req, res, next) => {
    try {
      const body = enabledBodySchema.parse(req.body);
      const found = await findTemplateDocument();
      if (!found?.published) {
        res.status(409).json({ message: "No certificate template is published yet." });
        return;
      }
      const parsed = certificateTemplatePayloadSchema.safeParse(found.published.payload);
      if (!parsed.success) {
        res.status(409).json({
          message:
            "The published template does not match the expected shape, so it cannot be switched safely."
        });
        return;
      }
      if (parsed.data.enabled === body.enabled) {
        res.status(200).json({ enabled: parsed.data.enabled, message: "Already set." });
        return;
      }

      const actor = actorOf(req);
      const note = body.enabled ? "Switched certificate issuing ON" : "Switched certificate issuing OFF";
      const { draft } = await configService.updateDraft(actor, found.document.id, {
        payload: { ...parsed.data, enabled: body.enabled },
        changeSummary: note
      });
      await configService.publishDocument(actor, found.document.id, {
        expectedDraftVersionId: draft.id,
        publishNote: note
      });
      // Publishing through the service does not refresh this process's cache,
      // and the flag has to take effect on the next module completion rather
      // than in a minute — so refresh explicitly, as the config routes do.
      await deps.refreshCache();

      logTemplateAction(body.enabled ? "template_enabled" : "template_disabled", req, {
        documentId: found.document.id
      });
      res.status(200).json({ enabled: body.enabled });
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ message: error.issues[0]?.message ?? "Invalid request" });
        return;
      }
      next(error);
    }
  });

  // ----------------------------------------------------------------- draft

  router.get("/certificates-template/draft", async (_req, res, next) => {
    try {
      const found = await findTemplateDocument();
      if (!found) {
        res.status(200).json({ exists: false });
        return;
      }
      res.status(200).json({
        exists: true,
        documentId: found.document.id,
        draftVersionId: found.draft?.id ?? null,
        draft: found.draft?.payload ?? null,
        draftUpdatedAt: found.draft?.createdAt ?? null,
        published: found.published?.payload ?? null,
        publishedVersion: found.published?.versionNumber ?? null,
        publishedAt: found.published?.publishedAt ?? null
      });
    } catch (error) {
      next(error);
    }
  });

  router.put("/certificates-template/draft", requireWriteAccess, async (req, res, next) => {
    try {
      const body = draftBodySchema.parse(req.body);
      const parsed = parseTemplatePayload(body.payload);
      if (!parsed.ok) {
        res.status(400).json({ message: parsed.message });
        return;
      }
      const missing = await missingAssets(parsed.payload);
      if (missing.length > 0) {
        res.status(400).json({
          message: `This layout uses artwork that has not been uploaded: ${missing.join(", ")}.`
        });
        return;
      }
      const found = await findTemplateDocument();
      if (!found) {
        res.status(409).json({ message: "No certificate template exists yet." });
        return;
      }

      const { draft } = await configService.updateDraft(actorOf(req), found.document.id, {
        payload: parsed.payload,
        ...(body.changeSummary ? { changeSummary: body.changeSummary } : {})
      });
      logTemplateAction("draft_saved", req, { documentId: found.document.id, draftVersionId: draft.id });
      res.status(200).json({ draftVersionId: draft.id, versionNumber: draft.versionNumber });
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ message: error.issues[0]?.message ?? "Invalid request" });
        return;
      }
      next(error);
    }
  });

  // --------------------------------------------------------------- publish

  router.post("/certificates-template/publish", requirePublishAccess, async (req, res, next) => {
    try {
      const body = publishBodySchema.parse(req.body);
      const found = await findTemplateDocument();
      if (!found) {
        res.status(409).json({ message: "No certificate template exists yet." });
        return;
      }
      const { published } = await configService.publishDocument(actorOf(req), found.document.id, {
        expectedDraftVersionId: body.expectedDraftVersionId,
        ...(body.publishNote ? { publishNote: body.publishNote } : {})
      });
      await deps.refreshCache();
      logTemplateAction("published", req, {
        documentId: found.document.id,
        versionNumber: published.versionNumber
      });
      res.status(200).json({ versionNumber: published.versionNumber });
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ message: error.issues[0]?.message ?? "Invalid request" });
        return;
      }
      next(error);
    }
  });

  // --------------------------------------------------------------- history

  router.get("/certificates-template/history", async (_req, res, next) => {
    try {
      const found = await findTemplateDocument();
      if (!found) {
        res.status(200).json({ versions: [], audit: [] });
        return;
      }
      const history = await configService.getHistoryByNamespaceKey(
        "integration",
        CERTIFICATE_TEMPLATE_KEY
      );
      res.status(200).json({
        // Payloads are omitted deliberately: a template payload is several
        // kilobytes and a history list is a list of WHAT HAPPENED, not of
        // twenty copies of the design.
        versions: history.versions.map((version) => ({
          id: version.id,
          versionNumber: version.versionNumber,
          state: version.state,
          changeSummary: version.changeSummary ?? null,
          createdAt: version.createdAt,
          createdBy: version.createdBy,
          publishedAt: version.publishedAt ?? null,
          publishedBy: version.publishedBy ?? null
        })),
        audit: history.audit.map((entry) => ({
          id: entry.id,
          action: entry.action,
          actorId: entry.actorId,
          actorRole: entry.actorRole,
          createdAt: entry.createdAt
        }))
      });
    } catch (error) {
      next(error);
    }
  });

  router.post("/certificates-template/rollback", requirePublishAccess, async (req, res, next) => {
    try {
      const body = rollbackBodySchema.parse(req.body);
      const found = await findTemplateDocument();
      if (!found) {
        res.status(409).json({ message: "No certificate template exists yet." });
        return;
      }
      const { published } = await configService.rollbackDocument(actorOf(req), found.document.id, {
        targetVersionId: body.targetVersionId,
        ...(body.rollbackReason ? { rollbackReason: body.rollbackReason } : {})
      });
      await deps.refreshCache();
      logTemplateAction("rolled_back", req, {
        documentId: found.document.id,
        versionNumber: published.versionNumber
      });
      res.status(200).json({ versionNumber: published.versionNumber });
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ message: error.issues[0]?.message ?? "Invalid request" });
        return;
      }
      next(error);
    }
  });

  // ---------------------------------------------------------------- create

  router.post("/certificates-template", requireWriteAccess, async (req, res, next) => {
    try {
      const body = createBodySchema.parse(req.body);
      const size = await deps.assetSize(body.assetKey);
      if (!size) {
        res.status(400).json({ message: `No artwork has been uploaded under ${body.assetKey}.` });
        return;
      }
      const existing = await findTemplateDocument();
      if (existing) {
        // Creating a second one would leave two documents claiming the same
        // key, and the runtime cache would pick whichever it saw last.
        res.status(409).json({ message: "A certificate template already exists." });
        return;
      }
      // The canvas takes the background's TRUE dimensions, so the normalised
      // coordinates below denormalise against the artwork actually uploaded
      // rather than an assumed aspect ratio.
      const starter = buildStarterTemplate({
        assetKey: body.assetKey,
        width: size.width,
        height: size.height,
        programmeName: body.programmeName,
        issuerName: body.issuerName
      });
      const created = await configService.createDocument(actorOf(req), {
        namespace: "integration",
        key: CERTIFICATE_TEMPLATE_KEY,
        type: "integration_config",
        title: "Certificate template",
        initialPayload: starter
      });
      logTemplateAction("created", req, { documentId: created.document.id });
      res.status(201).json({ documentId: created.document.id, draft: starter });
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ message: error.issues[0]?.message ?? "Invalid request" });
        return;
      }
      next(error);
    }
  });

  // --------------------------------------------------------------- preview

  router.get("/certificates-template/samples", (_req, res) => {
    res.status(200).json({ items: CERTIFICATE_PREVIEW_SAMPLES });
  });

  /**
   * Renders an UNSAVED payload through the real renderer.
   *
   * This is the load-bearing decision of the whole editor. A drag-and-drop
   * canvas naturally previews with HTML and CSS, and that preview would be
   * wrong: certificates are drawn by sharp against fonts installed in the
   * runtime image, with its own metrics, kerning and wrapping. The two would
   * disagree by a few pixels, the browser version is what gets signed off, and
   * every issued certificate would then be subtly not the thing that was
   * approved. So the canvas positions boxes and this endpoint draws the truth.
   *
   * `enabled` is not consulted here. Previewing a draft that is deliberately
   * switched off is the entire point; the gate belongs on issuing.
   */
  router.post("/certificates-template/preview", requireWriteAccess, async (req, res, next) => {
    try {
      const body = previewBodySchema.parse(req.body);
      const parsed = parseTemplatePayload(body.payload);
      if (!parsed.ok) {
        res.status(400).json({ message: parsed.message });
        return;
      }
      const sample = findPreviewSample(body.sampleId);

      let png: Buffer;
      try {
        png = await deps.renderPng({
          template: parsed.payload,
          values: {
            learnerName: sample.learnerName,
            programmeName: parsed.payload.programmeName,
            issuedDate: new Date().toISOString().slice(0, 10),
            certificateId: PREVIEW_CERTIFICATE_ID
          },
          // Points at an id that does not exist, on purpose: scanning the QR
          // during a design review should not open somebody's real credential.
          verifyUrl: `${publicBaseUrl()}/c/${PREVIEW_CERTIFICATE_ID}`,
          loadAsset: loadAssetFromDb
        });
      } catch (renderError) {
        // The renderer's own messages already name the missing asset or the
        // malformed field, which is exactly what an admin needs to see.
        res.status(400).json({
          message: renderError instanceof Error ? renderError.message : String(renderError)
        });
        return;
      }

      const shrunk = await sharp(png).resize({ width: PREVIEW_WIDTH, fit: "inside", withoutEnlargement: true }).png().toBuffer();
      res.setHeader("Content-Type", "image/png");
      res.setHeader("X-Content-Type-Options", "nosniff");
      // Never cached: the whole value of this image is that it reflects the
      // payload just posted.
      res.setHeader("Cache-Control", "no-store");
      res.status(200).send(shrunk);
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

export const certificateTemplateRouter = createCertificateTemplateRouter();
