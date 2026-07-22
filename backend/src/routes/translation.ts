import { Router } from "express";
import type { NextFunction, Request, Response } from "express";
import { z, ZodError } from "zod";
import { authenticateJwt, requireRoles } from "../auth/jwt-rbac.js";
import { getConfigPlatformService } from "../config-platform/service.js";
import { getRuntimeTranslationConfig } from "../config-platform/runtime-config.js";
import { providersSupporting } from "../translation/providers/contracts.js";
import { runTranslation } from "../translation/runner.js";
import { getDraft, listDrafts, saveReviewerEdits, setStatus } from "../translation/draft-store.js";
import { promoteDraft } from "../translation/promote.js";

export const translationRouter = Router();

// Gate the whole translation API behind a valid admin JWT (same token the rest
// of /api/admin/* uses). Mutations additionally require editor/admin.
translationRouter.use(authenticateJwt);
const requireEditor = requireRoles(["editor", "admin"]);

const runRequestSchema = z.object({
  documentIds: z.union([z.array(z.string().min(1)).min(1), z.literal("all")]),
  language: z.enum(["pcm", "ig"])
});

const saveRequestSchema = z.object({
  payload: z.record(z.string(), z.unknown()),
  assignee: z.string().trim().max(200).optional()
});

// promoteDraft (and the run/language pairing guard) require the narrowed
// "pcm" | "ig" literal union, not a bare string — validate the URL param
// against it rather than casting.
const languageParamSchema = z.enum(["pcm", "ig"]);

function respondZodError(error: unknown, res: Response, next: NextFunction) {
  if (error instanceof z.ZodError) {
    res.status(400).json({ message: error.issues[0]?.message ?? "Invalid request payload." });
    return;
  }
  next(error);
}

/** Review list + the lessons available to translate (for the run picker). */
translationRouter.get("/", async (_req, res, next) => {
  try {
    const drafts = await listDrafts();
    const service = getConfigPlatformService();
    const result = await service.listDocuments({ namespace: "content", page: 1, pageSize: 200 });
    const lessons = result.items
      .filter((i) => i.document.key.startsWith("content.lesson.") && i.published)
      .map((i) => ({ id: i.document.id, key: i.document.key, title: i.document.title ?? i.document.key }));
    res.status(200).json({ drafts, lessons });
  } catch (error) {
    next(error);
  }
});

translationRouter.post("/run", requireEditor, async (req, res, next) => {
  try {
    const body = runRequestSchema.parse(req.body);
    const config = getRuntimeTranslationConfig();
    if (!config) {
      res.status(400).json({ message: "Configure and publish the Translation integration before running a translation." });
      return;
    }
    // Reject an unsupported provider/language pairing BEFORE spending any
    // requests: e.g. pcm routed to igbo_api, which cannot produce Pidgin.
    const provider = config.providerByLanguage[body.language];
    if (!providersSupporting(body.language).includes(provider)) {
      res.status(400).json({
        message: `${provider} cannot produce ${body.language === "pcm" ? "Nigerian Pidgin" : "Igbo"}. Choose a different provider for this language in the Translation settings.`
      });
      return;
    }
    const report = await runTranslation({ documentIds: body.documentIds, language: body.language, config });
    res.status(200).json({ report });
  } catch (error) {
    respondZodError(error, res, next);
  }
});

translationRouter.get("/:documentId/:language", async (req, res, next) => {
  try {
    const draft = await getDraft(String(req.params.documentId), String(req.params.language));
    if (!draft) {
      res.status(404).json({ message: "Translation draft not found." });
      return;
    }
    res.status(200).json({ draft });
  } catch (error) {
    next(error);
  }
});

translationRouter.put("/:documentId/:language", requireEditor, async (req, res, next) => {
  try {
    const body = saveRequestSchema.parse(req.body);
    const draft = await saveReviewerEdits(
      String(req.params.documentId),
      String(req.params.language),
      body.payload,
      body.assignee ?? req.authUser?.id
    );
    res.status(200).json({ draft });
  } catch (error) {
    respondZodError(error, res, next);
  }
});

translationRouter.post("/:documentId/:language/approve", requireEditor, async (req, res, next) => {
  try {
    const draft = await setStatus(String(req.params.documentId), String(req.params.language), "approved");
    res.status(200).json({ draft });
  } catch (error) {
    next(error);
  }
});

translationRouter.post("/:documentId/:language/promote", requireEditor, async (req, res, next) => {
  try {
    const language = languageParamSchema.parse(req.params.language);
    const actor = { id: req.authUser?.id ?? "unknown", role: req.authUser?.role ?? ("viewer" as const) };
    await promoteDraft(actor, String(req.params.documentId), language);
    res.status(200).json({ ok: true });
  } catch (error) {
    respondZodError(error, res, next);
  }
});

// Map business-rule failures to actionable status codes so the review UI can
// show the real message. Without this they fall through to the app's generic
// handler, which returns 500 for anything not containing "not found" — turning
// an expected "resolve the pending edit first" into a scary server error.
translationRouter.use((error: unknown, _req: Request, res: Response, next: NextFunction) => {
  if (error instanceof ZodError) {
    res.status(400).json({ message: "Invalid translation request.", details: error.issues.map((i) => i.message) });
    return;
  }
  const message = error instanceof Error ? error.message : String(error);
  if (/not found/i.test(message)) {
    res.status(404).json({ message });
    return;
  }
  // Conflicts and workflow-rule violations the operator can act on: the pending
  // -draft refusal, illegal status transitions, approve/promote out of order,
  // an unsupported provider/language pairing that reached the service.
  if (/unpublished changes|only an approved|illegal transition|cannot edit|cannot produce|no published version/i.test(message)) {
    res.status(409).json({ message });
    return;
  }
  next(error); // genuinely unexpected -> the app's generic 500 handler
});
