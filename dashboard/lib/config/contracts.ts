import { z } from "zod";

/**
 * GAP-E1: the public config contracts are Zod schemas (mirroring the backend's
 * `publicConfigResponseSchema` / `publicConfigBundleResponseSchema`) rather than
 * bare TypeScript types. The mandate requires validation on BOTH client and
 * server; previously the client cast the API JSON with `as PublicConfigBundle`,
 * so a malformed payload flowed straight into rendering.
 *
 * Types are derived from the schemas so the two can never drift.
 */
export const configNamespaceSchema = z.enum(["content", "options", "legal"]);

export const publicConfigDocumentSchema = z.object({
  namespace: configNamespaceSchema,
  key: z.string().min(1),
  versionTag: z.string().min(1),
  // Payload shape varies per document type, so accept any object here - the
  // consuming component narrows it. The point is that it IS an object.
  data: z.record(z.string(), z.unknown()),
  updatedAt: z.string().min(1)
});

export const publicConfigBundleSchema = z.object({
  versionTag: z.string().min(1),
  documents: z.array(publicConfigDocumentSchema)
});

export type ConfigNamespace = z.infer<typeof configNamespaceSchema>;
export type PublicConfigDocument = z.infer<typeof publicConfigDocumentSchema>;
export type PublicConfigBundle = z.infer<typeof publicConfigBundleSchema>;

export type ConfigApiResult<T> = {
  data: T;
  source: "live" | "empty";
  message?: string;
};

/**
 * Validate an API response into a bundle.
 *
 * Resilient by design: the envelope must be well-formed, but an individual
 * malformed document is DROPPED rather than discarding every other (valid)
 * document. Returns null when the envelope itself is unusable, so the caller
 * can fall back to safe empty defaults instead of rendering garbage.
 */
export function parsePublicConfigBundle(input: unknown): PublicConfigBundle | null {
  const envelope = z
    .object({ versionTag: z.string().min(1), documents: z.array(z.unknown()) })
    .safeParse(input);
  if (!envelope.success) return null;

  const documents: PublicConfigDocument[] = [];
  for (const raw of envelope.data.documents) {
    const parsed = publicConfigDocumentSchema.safeParse(raw);
    if (parsed.success) documents.push(parsed.data);
  }
  return { versionTag: envelope.data.versionTag, documents };
}
