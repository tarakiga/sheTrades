import { Router } from "express";
import type { NextFunction, Request, Response } from "express";
import { ZodError, z } from "zod";
import {
  archiveDocumentRequestSchema,
  configPayloadSchema,
  createDocumentRequestSchema,
  listDocumentsQuerySchema,
  publishDocumentRequestSchema,
  reactivateDocumentRequestSchema,
  rollbackDocumentRequestSchema,
  updateDraftRequestSchema
} from "../config-platform/contracts.js";
import { ensureCategoryOptionSetSeeds } from "../config-platform/category-option-set-seeds.js";
import { authenticateJwt, requireRoles } from "../auth/jwt-rbac.js";
import { getConfigPlatformService } from "../config-platform/service.js";
import { refreshRuntimeConfigCache } from "../config-platform/runtime-config.js";

export const configAdminRouter = Router();
const service = getConfigPlatformService();

const actorFromRequest = (req: Request) => ({
  id: req.auth?.sub ?? "unknown",
  role: req.auth?.role ?? "viewer"
});

const domainPathSchema = z.enum(["content", "options", "legal", "integration"]);
const createDomainDocumentSchema = z.object({
  key: z
    .string()
    .min(1)
    .max(120)
    .regex(/^[a-zA-Z0-9_.-]+$/),
  type: z.enum(["lesson_content", "option_set", "legal_block", "ui_copy", "integration_config"]),
  title: z.string().min(1).max(160),
  initialPayload: configPayloadSchema
});

const allowedTypesByNamespace = {
  content: new Set(["lesson_content", "ui_copy"]),
  options: new Set(["option_set"]),
  legal: new Set(["legal_block"]),
  integration: new Set(["integration_config"])
} as const;

function getRequiredParam(req: Request, name: string) {
  return z.string().min(1).parse(req.params[name]);
}

function toListDocumentsQuery(query: Request["query"]) {
  const parsed = listDocumentsQuerySchema.parse(query);
  return {
    page: parsed.page,
    pageSize: parsed.pageSize,
    ...(parsed.namespace !== undefined ? { namespace: parsed.namespace } : {}),
    ...(parsed.type !== undefined ? { type: parsed.type } : {}),
    ...(parsed.keyPrefix !== undefined ? { keyPrefix: parsed.keyPrefix } : {})
  };
}

function assertTypeAllowedForNamespace(
  namespace: keyof typeof allowedTypesByNamespace,
  type: string
) {
  if (!allowedTypesByNamespace[namespace].has(type)) {
    throw new Error(`Document type '${type}' is not allowed for namespace '${namespace}'.`);
  }
}

function assertNamespaceAccess(
  namespace: z.infer<typeof domainPathSchema>,
  role: "viewer" | "editor" | "admin"
) {
  if (namespace === "integration" && role !== "admin") {
    const error = new Error("Insufficient role for integration settings.");
    Object.assign(error, { statusCode: 403 });
    throw error;
  }
}

configAdminRouter.use(authenticateJwt);

configAdminRouter.get("/session", requireRoles(["viewer", "editor", "admin"]), (req, res) => {
  res.status(200).json({
    actor: {
      id: req.auth?.sub,
      role: req.auth?.role
    }
  });
});

configAdminRouter.post(
  "/category-seeds/ensure",
  requireRoles(["admin"]),
  async (req, res, next) => {
    try {
      const payload = await ensureCategoryOptionSetSeeds(actorFromRequest(req));
      await refreshRuntimeConfigCache();
      res.status(200).json({
        message: "Settings category seeds ensured.",
        ...payload
      });
    } catch (error) {
      next(error);
    }
  }
);

configAdminRouter.get(
  "/documents",
  requireRoles(["viewer", "editor", "admin"]),
  async (req, res, next) => {
    try {
      const query = toListDocumentsQuery(req.query);
      if (query.namespace) {
        assertNamespaceAccess(query.namespace, actorFromRequest(req).role);
      }
      const payload = await service.listDocuments(query, {
        includeIntegration: actorFromRequest(req).role === "admin"
      });
      res.status(200).json(payload);
    } catch (error) {
      next(error);
    }
  }
);

configAdminRouter.post("/documents", requireRoles(["editor", "admin"]), async (req, res, next) => {
  try {
    const body = createDocumentRequestSchema.parse(req.body);
    assertNamespaceAccess(body.namespace, actorFromRequest(req).role);
    assertTypeAllowedForNamespace(body.namespace, body.type);
    const payload = await service.createDocument(actorFromRequest(req), body);
    await refreshRuntimeConfigCache();
    res.status(201).json({
      message: "Config document created.",
      ...payload
    });
  } catch (error) {
    next(error);
  }
});

configAdminRouter.put(
  "/documents/:documentId/draft",
  requireRoles(["editor", "admin"]),
  async (req, res, next) => {
    try {
      const document = await service.getDocument(getRequiredParam(req, "documentId"));
      assertNamespaceAccess(document.namespace, actorFromRequest(req).role);
      const body = updateDraftRequestSchema.parse(req.body);
      const payload = await service.updateDraft(
        actorFromRequest(req),
        document.id,
        {
          payload: body.payload,
          ...(body.changeSummary !== undefined ? { changeSummary: body.changeSummary } : {})
        }
      );
      await refreshRuntimeConfigCache();
      res.status(200).json({
        message: "Draft updated.",
        ...payload
      });
    } catch (error) {
      next(error);
    }
  }
);

configAdminRouter.post(
  "/documents/:documentId/publish",
  requireRoles(["admin"]),
  async (req, res, next) => {
    try {
      const document = await service.getDocument(getRequiredParam(req, "documentId"));
      assertNamespaceAccess(document.namespace, actorFromRequest(req).role);
      const body = publishDocumentRequestSchema.parse(req.body);
      const payload = await service.publishDocument(
        actorFromRequest(req),
        document.id,
        {
          expectedDraftVersionId: body.expectedDraftVersionId,
          ...(body.publishNote !== undefined ? { publishNote: body.publishNote } : {})
        }
      );
      await refreshRuntimeConfigCache();
      res.status(200).json({
        message: "Document published.",
        ...payload
      });
    } catch (error) {
      next(error);
    }
  }
);

configAdminRouter.post(
  "/documents/:documentId/rollback",
  requireRoles(["admin"]),
  async (req, res, next) => {
    try {
      const document = await service.getDocument(getRequiredParam(req, "documentId"));
      assertNamespaceAccess(document.namespace, actorFromRequest(req).role);
      const body = rollbackDocumentRequestSchema.parse(req.body);
      const payload = await service.rollbackDocument(
        actorFromRequest(req),
        document.id,
        {
          targetVersionId: body.targetVersionId,
          ...(body.rollbackReason !== undefined ? { rollbackReason: body.rollbackReason } : {})
        }
      );
      await refreshRuntimeConfigCache();
      res.status(200).json({
        message: "Document rollback completed.",
        ...payload
      });
    } catch (error) {
      next(error);
    }
  }
);

configAdminRouter.post(
  "/documents/:documentId/archive",
  requireRoles(["admin"]),
  async (req, res, next) => {
    try {
      const document = await service.getDocument(getRequiredParam(req, "documentId"));
      assertNamespaceAccess(document.namespace, actorFromRequest(req).role);
      const body = archiveDocumentRequestSchema.parse(req.body ?? {});
      const payload = await service.archiveDocument(
        actorFromRequest(req),
        document.id,
        {
          ...(body.archiveReason !== undefined ? { archiveReason: body.archiveReason } : {})
        }
      );
      await refreshRuntimeConfigCache();
      res.status(200).json({
        message: "Document archived.",
        ...payload
      });
    } catch (error) {
      next(error);
    }
  }
);

configAdminRouter.post(
  "/documents/:documentId/reactivate",
  requireRoles(["admin"]),
  async (req, res, next) => {
    try {
      const document = await service.getDocument(getRequiredParam(req, "documentId"));
      assertNamespaceAccess(document.namespace, actorFromRequest(req).role);
      const body = reactivateDocumentRequestSchema.parse(req.body ?? {});
      const payload = await service.reactivateDocument(
        actorFromRequest(req),
        document.id,
        {
          ...(body.reactivateReason !== undefined ? { reactivateReason: body.reactivateReason } : {})
        }
      );
      await refreshRuntimeConfigCache();
      res.status(200).json({
        message: "Document reactivated.",
        ...payload
      });
    } catch (error) {
      next(error);
    }
  }
);

configAdminRouter.get(
  "/documents/:documentId/history",
  requireRoles(["viewer", "editor", "admin"]),
  async (req, res, next) => {
    try {
      const document = await service.getDocument(getRequiredParam(req, "documentId"));
      assertNamespaceAccess(document.namespace, actorFromRequest(req).role);
      const payload = await service.getHistory(document.id);
      res.status(200).json(payload);
    } catch (error) {
      next(error);
    }
  }
);

configAdminRouter.get(
  "/:namespace/documents",
  requireRoles(["viewer", "editor", "admin"]),
  async (req, res, next) => {
    try {
      const namespace = domainPathSchema.parse(req.params.namespace);
      assertNamespaceAccess(namespace, actorFromRequest(req).role);
      const query = toListDocumentsQuery({
        ...req.query,
        namespace
      });
      const payload = await service.listDocuments(query);
      res.status(200).json(payload);
    } catch (error) {
      next(error);
    }
  }
);

configAdminRouter.post(
  "/:namespace/documents",
  requireRoles(["editor", "admin"]),
  async (req, res, next) => {
    try {
      const namespace = domainPathSchema.parse(req.params.namespace);
      assertNamespaceAccess(namespace, actorFromRequest(req).role);
      const body = createDomainDocumentSchema.parse(req.body);
      assertTypeAllowedForNamespace(namespace, body.type);
      const payload = await service.createDocument(actorFromRequest(req), {
        namespace,
        key: body.key,
        type: body.type,
        title: body.title,
        initialPayload: body.initialPayload
      });
      await refreshRuntimeConfigCache();
      res.status(201).json({
        message: "Config document created.",
        ...payload
      });
    } catch (error) {
      next(error);
    }
  }
);

configAdminRouter.get(
  "/:namespace/documents/:key",
  requireRoles(["viewer", "editor", "admin"]),
  async (req, res, next) => {
    try {
      const namespace = domainPathSchema.parse(req.params.namespace);
      assertNamespaceAccess(namespace, actorFromRequest(req).role);
      const payload = await service.getDocumentByNamespaceKey(namespace, getRequiredParam(req, "key"));
      res.status(200).json(payload);
    } catch (error) {
      next(error);
    }
  }
);

configAdminRouter.put(
  "/:namespace/documents/:key/draft",
  requireRoles(["editor", "admin"]),
  async (req, res, next) => {
    try {
      const namespace = domainPathSchema.parse(req.params.namespace);
      assertNamespaceAccess(namespace, actorFromRequest(req).role);
      const document = await service.getDocumentByNamespaceKey(namespace, getRequiredParam(req, "key"));
      const body = updateDraftRequestSchema.parse(req.body);
      const payload = await service.updateDraft(
        actorFromRequest(req),
        document.document.id,
        {
          payload: body.payload,
          ...(body.changeSummary !== undefined ? { changeSummary: body.changeSummary } : {})
        }
      );
      await refreshRuntimeConfigCache();
      res.status(200).json({
        message: "Draft updated.",
        ...payload
      });
    } catch (error) {
      next(error);
    }
  }
);

configAdminRouter.post(
  "/:namespace/documents/:key/publish",
  requireRoles(["admin"]),
  async (req, res, next) => {
    try {
      const namespace = domainPathSchema.parse(req.params.namespace);
      assertNamespaceAccess(namespace, actorFromRequest(req).role);
      const document = await service.getDocumentByNamespaceKey(namespace, getRequiredParam(req, "key"));
      const body = publishDocumentRequestSchema.parse(req.body);
      const payload = await service.publishDocument(
        actorFromRequest(req),
        document.document.id,
        {
          expectedDraftVersionId: body.expectedDraftVersionId,
          ...(body.publishNote !== undefined ? { publishNote: body.publishNote } : {})
        }
      );
      await refreshRuntimeConfigCache();
      res.status(200).json({
        message: "Document published.",
        ...payload
      });
    } catch (error) {
      next(error);
    }
  }
);

configAdminRouter.post(
  "/:namespace/documents/:key/rollback",
  requireRoles(["admin"]),
  async (req, res, next) => {
    try {
      const namespace = domainPathSchema.parse(req.params.namespace);
      assertNamespaceAccess(namespace, actorFromRequest(req).role);
      const document = await service.getDocumentByNamespaceKey(namespace, getRequiredParam(req, "key"));
      const body = rollbackDocumentRequestSchema.parse(req.body);
      const payload = await service.rollbackDocument(actorFromRequest(req), document.document.id, {
        targetVersionId: body.targetVersionId,
        ...(body.rollbackReason !== undefined ? { rollbackReason: body.rollbackReason } : {})
      });
      await refreshRuntimeConfigCache();
      res.status(200).json({
        message: "Document rollback completed.",
        ...payload
      });
    } catch (error) {
      next(error);
    }
  }
);

configAdminRouter.post(
  "/:namespace/documents/:key/archive",
  requireRoles(["admin"]),
  async (req, res, next) => {
    try {
      const namespace = domainPathSchema.parse(req.params.namespace);
      assertNamespaceAccess(namespace, actorFromRequest(req).role);
      const body = archiveDocumentRequestSchema.parse(req.body ?? {});
      const payload = await service.archiveDocumentByNamespaceKey(
        actorFromRequest(req),
        namespace,
        getRequiredParam(req, "key"),
        {
          ...(body.archiveReason !== undefined ? { archiveReason: body.archiveReason } : {})
        }
      );
      await refreshRuntimeConfigCache();
      res.status(200).json({
        message: "Document archived.",
        ...payload
      });
    } catch (error) {
      next(error);
    }
  }
);

configAdminRouter.post(
  "/:namespace/documents/:key/reactivate",
  requireRoles(["admin"]),
  async (req, res, next) => {
    try {
      const namespace = domainPathSchema.parse(req.params.namespace);
      assertNamespaceAccess(namespace, actorFromRequest(req).role);
      const body = reactivateDocumentRequestSchema.parse(req.body ?? {});
      const payload = await service.reactivateDocumentByNamespaceKey(
        actorFromRequest(req),
        namespace,
        getRequiredParam(req, "key"),
        {
          ...(body.reactivateReason !== undefined ? { reactivateReason: body.reactivateReason } : {})
        }
      );
      await refreshRuntimeConfigCache();
      res.status(200).json({
        message: "Document reactivated.",
        ...payload
      });
    } catch (error) {
      next(error);
    }
  }
);

configAdminRouter.delete(
  "/documents/:documentId/purge",
  requireRoles(["admin"]),
  async (req, res, next) => {
    try {
      const document = await service.getDocument(getRequiredParam(req, "documentId"));
      assertNamespaceAccess(document.namespace, actorFromRequest(req).role);
      const payload = await service.purgeDocument(actorFromRequest(req), document.id);
      await refreshRuntimeConfigCache();
      res.status(200).json({
        message: "Document permanently deleted.",
        ...payload
      });
    } catch (error) {
      next(error);
    }
  }
);

configAdminRouter.post(
  "/documents/purge-trash",
  requireRoles(["admin"]),
  async (req, res, next) => {
    try {
      const { namespace } = z
        .object({ namespace: z.enum(["content", "options", "legal"]) })
        .parse(req.body);
      assertNamespaceAccess(namespace, actorFromRequest(req).role);
      const payload = await service.purgeTrashForNamespace(actorFromRequest(req), namespace);
      await refreshRuntimeConfigCache();
      res.status(200).json({
        message: `Permanently deleted ${payload.purgedCount} trashed document(s).`,
        ...payload
      });
    } catch (error) {
      next(error);
    }
  }
);

configAdminRouter.get(
  "/:namespace/documents/:key/history",
  requireRoles(["viewer", "editor", "admin"]),
  async (req, res, next) => {
    try {
      const namespace = domainPathSchema.parse(req.params.namespace);
      assertNamespaceAccess(namespace, actorFromRequest(req).role);
      const payload = await service.getHistoryByNamespaceKey(namespace, getRequiredParam(req, "key"));
      res.status(200).json(payload);
    } catch (error) {
      next(error);
    }
  }
);

configAdminRouter.use((error: unknown, _req: Request, res: Response, next: NextFunction) => {
  if (error instanceof ZodError) {
    res.status(400).json({
      message: "Invalid config admin request payload.",
      details: error.issues.map((issue) => issue.message)
    });
    return;
  }
  if (error instanceof Error && "statusCode" in error && error.statusCode === 403) {
    res.status(403).json({ message: error.message });
    return;
  }
  if (error instanceof Error && error.message === "Config document not found.") {
    res.status(404).json({ message: error.message });
    return;
  }
  if (
    error instanceof Error &&
    /not allowed|not found|empty|Expected draft|already hidden|already visible|No previous live version/.test(
      error.message
    )
  ) {
    res.status(409).json({ message: error.message });
    return;
  }
  next(error);
});
