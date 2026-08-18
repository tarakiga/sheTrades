/**
 * Certificate artwork: list it, upload it, serve it back to the editor.
 *
 * This is the half of Phase 2 that lets an admin change what a certificate
 * LOOKS like without a deploy. Phase 1 loaded artwork from files in the repo
 * through a seed script; that still works and is still how the shipped design
 * got there, but it required an engineer, and the point of the config platform
 * is that it should not.
 *
 * Two properties are worth stating outright because both are easy to lose:
 *
 *   - UPLOADS NEVER REPLACE. A key that already exists is refused (409), not
 *     overwritten. Issued certificates freeze their template, and that frozen
 *     copy names artwork by key -- so overwriting bytes would silently redraw
 *     credentials already in learners' hands. See asset-upload.ts.
 *
 *   - THE DECLARED TYPE IS NOT BELIEVED. It is checked against an allowlist and
 *     then corroborated against what sharp actually decodes, and the stored
 *     mimeType is derived from what survived both. The raw route serves that
 *     stored type with `nosniff`, so an uploaded file cannot later be coerced
 *     into being interpreted as something else.
 */
import { createHash } from "node:crypto";
import express, { Router } from "express";
import sharp from "sharp";
import { z } from "zod";
import { prisma } from "../admin/prisma.js";
import { authenticateJwt, requireRoles } from "../auth/jwt-rbac.js";
import { MAX_ASSET_BYTES, validateAssetUpload } from "./asset-upload.js";

/** What the editor's asset picker needs. Deliberately without `bytes`: a list
 * of five print-resolution backgrounds is tens of megabytes, and nothing in a
 * picker needs the pixels. */
export type CertificateAssetSummary = {
  key: string;
  kind: string;
  mimeType: string;
  width: number;
  height: number;
  byteSize: number;
  uploadedBy: string;
  uploadedAt: string;
};

export type StoredAssetBytes = { bytes: Buffer; mimeType: string };

export type ImageProbe = {
  format: string | undefined;
  width: number;
  height: number;
};

export type CertificateAssetDeps = {
  list: () => Promise<CertificateAssetSummary[]>;
  exists: (key: string) => Promise<boolean>;
  create: (input: {
    key: string;
    kind: string;
    mimeType: string;
    /** Pinned to an ArrayBuffer-backed view rather than a bare Buffer: Prisma's
     * Bytes column will not accept the looser ArrayBufferLike a Buffer can
     * carry, and the mismatch is easier to fix here than at every call. */
    bytes: Uint8Array<ArrayBuffer>;
    width: number;
    height: number;
    checksum: string;
    uploadedBy: string;
  }) => Promise<void>;
  read: (key: string) => Promise<StoredAssetBytes | null>;
  /** Injected so the route's decisions can be tested without a real encoder. */
  probe: (bytes: Buffer) => Promise<ImageProbe>;
};

const uploadQuerySchema = z.object({
  key: z.string().trim().min(1).max(64),
  kind: z.enum(["background", "logo"])
});

const keyParamsSchema = z.object({ key: z.string().trim().min(1).max(64) });

async function probeWithSharp(bytes: Buffer): Promise<ImageProbe> {
  try {
    const meta = await sharp(bytes).metadata();
    return { format: meta.format, width: meta.width ?? 0, height: meta.height ?? 0 };
  } catch {
    // A file sharp cannot open is not an error to propagate -- it is simply not
    // an image, which validateAssetUpload already has a verdict for.
    return { format: undefined, width: 0, height: 0 };
  }
}

const defaultDeps: CertificateAssetDeps = {
  list: async () => {
    const rows = await prisma.certificateAsset.findMany({
      orderBy: { uploadedAt: "desc" },
      select: {
        key: true,
        kind: true,
        mimeType: true,
        width: true,
        height: true,
        uploadedBy: true,
        uploadedAt: true,
        bytes: true
      }
    });
    return rows.map((row) => ({
      key: row.key,
      kind: row.kind,
      mimeType: row.mimeType,
      width: row.width,
      height: row.height,
      byteSize: Buffer.from(row.bytes).length,
      uploadedBy: row.uploadedBy,
      uploadedAt: row.uploadedAt.toISOString()
    }));
  },
  exists: async (key) => {
    const row = await prisma.certificateAsset.findUnique({ where: { key }, select: { key: true } });
    return row !== null;
  },
  create: async (input) => {
    await prisma.certificateAsset.create({ data: input });
  },
  read: async (key) => {
    const row = await prisma.certificateAsset.findUnique({
      where: { key },
      select: { bytes: true, mimeType: true }
    });
    if (!row) return null;
    return { bytes: Buffer.from(row.bytes), mimeType: row.mimeType };
  },
  probe: probeWithSharp
};

function logAssetAction(
  action: string,
  key: string,
  req: express.Request,
  extra: Record<string, unknown> = {}
) {
  console.log(
    JSON.stringify({
      event: "certificate.asset_action",
      action,
      key,
      actorId: req.auth?.sub ?? null,
      actorRole: req.auth?.role ?? null,
      updatedAt: new Date().toISOString(),
      ...extra
    })
  );
}

function mimeForFormat(format: string | undefined): string | null {
  switch (format) {
    case "png":
      return "image/png";
    case "jpeg":
      return "image/jpeg";
    case "svg":
      return "image/svg+xml";
    default:
      return null;
  }
}

export function createCertificateAssetRouter(overrides: Partial<CertificateAssetDeps> = {}): Router {
  const deps: CertificateAssetDeps = { ...defaultDeps, ...overrides };
  const router = Router();
  router.use(authenticateJwt);

  router.get("/certificate-assets", async (_req, res, next) => {
    try {
      res.status(200).json({ items: await deps.list() });
    } catch (error) {
      next(error);
    }
  });

  router.post(
    "/certificate-assets",
    requireRoles(["editor", "admin"]),
    // Any content type is buffered, so the ALLOWLIST produces the error rather
    // than a silently empty body. The parser's limit sits above the enforced
    // cap so an oversized upload gets the friendly message from
    // validateAssetUpload instead of express's own bare 413.
    express.raw({ type: () => true, limit: MAX_ASSET_BYTES + 1024 * 1024 }),
    async (req, res, next) => {
      try {
        const query = uploadQuerySchema.parse(req.query);
        // Copied rather than aliased: express hands back a Buffer whose backing
        // store is typed loosely enough that Prisma will not accept it, and a
        // 5 MB copy once per upload is not worth a cast that hides the reason.
        const raw: unknown = req.body;
        const bytes = Buffer.isBuffer(raw) ? Buffer.from(raw as Uint8Array) : Buffer.alloc(0);
        const probed = await deps.probe(bytes);
        const verdict = validateAssetUpload({
          key: query.key,
          kind: query.kind,
          declaredMime: String(req.headers["content-type"] ?? ""),
          byteLength: bytes.length,
          detectedFormat: probed.format,
          width: probed.width,
          height: probed.height,
          keyTaken: await deps.exists(query.key)
        });
        if (!verdict.ok) {
          res.status(verdict.status).json({ message: verdict.reason });
          return;
        }

        // Derived from the allowlist entry the DECODED bytes matched, never
        // copied from the request header, so what is served back can never
        // contradict what is stored.
        const mimeType = mimeForFormat(probed.format);
        if (!mimeType) {
          res.status(400).json({ message: "That file could not be read as an image." });
          return;
        }

        await deps.create({
          key: query.key,
          kind: query.kind,
          mimeType,
          bytes,
          width: probed.width,
          height: probed.height,
          checksum: createHash("sha256").update(bytes).digest("hex"),
          uploadedBy: req.auth?.sub ?? "unknown"
        });
        logAssetAction("upload", query.key, req, {
          kind: query.kind,
          size: probed.width + "x" + probed.height,
          bytes: bytes.length
        });
        res.status(201).json({
          key: query.key,
          kind: query.kind,
          mimeType,
          width: probed.width,
          height: probed.height,
          byteSize: bytes.length
        });
      } catch (error) {
        if (error instanceof z.ZodError) {
          res.status(400).json({
            message: "Give the artwork a name and say whether it is a background or a logo."
          });
          return;
        }
        next(error);
      }
    }
  );

  router.get("/certificate-assets/:key/raw", async (req, res, next) => {
    try {
      const { key } = keyParamsSchema.parse(req.params);
      const found = await deps.read(key);
      if (!found) {
        res.status(404).json({ message: "Artwork not found" });
        return;
      }
      res.setHeader("Content-Type", found.mimeType);
      res.setHeader("X-Content-Type-Options", "nosniff");
      // Private because this sits behind an admin token, so no shared cache
      // should hold it. Short-lived because the picker re-reads it whenever it
      // changes -- and artwork is immutable anyway.
      res.setHeader("Cache-Control", "private, max-age=300");
      res.status(200).send(found.bytes);
    } catch (error) {
      next(error);
    }
  });

  return router;
}

export const certificateAssetRouter = createCertificateAssetRouter();
