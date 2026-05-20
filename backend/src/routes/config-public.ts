import { Router } from "express";
import type { Response } from "express";
import { z } from "zod";
import {
  publicConfigNamespaceSchema,
  publicConfigBundleResponseSchema,
  publicConfigResponseSchema
} from "../config-platform/contracts.js";
import { getConfigPlatformService } from "../config-platform/service.js";

export const configPublicRouter = Router();
const service = getConfigPlatformService();

const CACHE_CONTROL = "public, max-age=60, stale-while-revalidate=300";
const keySchema = z
  .string()
  .min(1)
  .max(120)
  .regex(/^[a-zA-Z0-9_.-]+$/);

function withCachingHeaders(res: Response, versionTag: string) {
  res.setHeader("Cache-Control", CACHE_CONTROL);
  res.setHeader("ETag", `"${versionTag}"`);
}

function isNotModified(ifNoneMatch: string | undefined, versionTag: string) {
  if (!ifNoneMatch) return false;
  const normalized = ifNoneMatch.replace(/^W\//, "").replace(/^"|"$/g, "");
  return normalized === versionTag;
}

configPublicRouter.get("/bundle", async (req, res, next) => {
  try {
    const payload = publicConfigBundleResponseSchema.parse(await service.getPublishedConfig());
    if (isNotModified(req.header("if-none-match"), payload.versionTag)) {
      withCachingHeaders(res, payload.versionTag);
      res.status(304).end();
      return;
    }
    withCachingHeaders(res, payload.versionTag);
    res.status(200).json(payload);
  } catch (error) {
    next(error);
  }
});

configPublicRouter.get("/:namespace", async (req, res, next) => {
  try {
    const namespace = publicConfigNamespaceSchema.parse(req.params.namespace);
    const payload = publicConfigBundleResponseSchema.parse(await service.getPublishedConfig(namespace));
    if (isNotModified(req.header("if-none-match"), payload.versionTag)) {
      withCachingHeaders(res, payload.versionTag);
      res.status(304).end();
      return;
    }
    withCachingHeaders(res, payload.versionTag);
    res.status(200).json(payload);
  } catch (error) {
    next(error);
  }
});

configPublicRouter.get("/:namespace/:key", async (req, res, next) => {
  try {
    const namespace = publicConfigNamespaceSchema.parse(req.params.namespace);
    const key = keySchema.parse(req.params.key);
    const bundle = await service.getPublishedConfig(namespace);
    const item = bundle.documents.find((document: any) => document.key === key);
    if (!item) {
      res.status(404).json({ message: "Published config not found." });
      return;
    }
    const payload = publicConfigResponseSchema.parse(item);
    if (isNotModified(req.header("if-none-match"), payload.versionTag)) {
      withCachingHeaders(res, payload.versionTag);
      res.status(304).end();
      return;
    }
    withCachingHeaders(res, payload.versionTag);
    res.status(200).json(payload);
  } catch (error) {
    next(error);
  }
});

