import { z } from "zod";

/**
 * Layout contract for the completion certificate — where the learner's name,
 * the date, the partner logos and the verification QR sit on the artwork.
 *
 * Every position and size is stored NORMALISED (0..1, a fraction of the canvas)
 * rather than in pixels. An admin authors the layout against an ~800px preview
 * but the issued certificate is rendered at print resolution; pixel values would
 * be correct in the preview and silently wrong in the artefact the learner
 * keeps. The resulting bug presents as "the name looks slightly off" — no error,
 * no log line, and no obvious culprit — so the unit is fixed at the contract
 * boundary instead of being negotiated per call site.
 *
 * The document itself lives in the `integration` namespace with type
 * `integration_config` and key `certificate.template`, following the
 * reward-rules precedent: the runtime cache keys off the namespace, not the key
 * prefix, so anything that needs to be readable via getRuntimeIntegrationConfig
 * has to be an integration_config. The `kind` literal below is what keeps it
 * distinguishable inside integrationConfigPayloadSchema.
 */

/**
 * The 0..1 rule stated once. Reused for coordinates, widths, font size and
 * opacity so a new field cannot accidentally opt out of it.
 */
const normalised = z.number().min(0).max(1);

const alignSchema = z.enum(["left", "center", "right"]);

/** Text drawn from the certificate record. No free text: an admin repositions
 * and restyles these, but cannot invent a variable the renderer has no value
 * for. */
export const certificateTextVariableSchema = z.enum([
  "learnerName",
  "programmeName",
  "issuedDate",
  "certificateId"
]);

const certificateTextFieldSchema = z.object({
  id: z.string().min(1),
  variable: certificateTextVariableSchema,
  x: normalised,
  y: normalised,
  maxWidth: normalised.default(0.8),
  align: alignSchema.default("center"),
  font: z.string().min(1),
  /** Font size as a fraction of canvas HEIGHT, for the same reason as above:
   * the type has to scale with the render, not with the authoring preview. */
  size: normalised,
  weight: z.number().int().min(100).max(900).default(400),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  autoShrink: z.boolean().default(true)
});
export type CertificateTextField = z.infer<typeof certificateTextFieldSchema>;

/** Images placed on the artwork. `logo` is repeatable by design — several
 * partner marks sit as independent fields, so one partner's rebrand (or their
 * departure from the programme) touches exactly one field and leaves the rest
 * of the layout untouched. */
export const certificateImageVariableSchema = z.enum(["logo", "qrCode"]);

const certificateImageFieldSchema = z
  .object({
    id: z.string().min(1),
    variable: certificateImageVariableSchema,
    /** Optional at the field level because a `qrCode` has no stored asset — it
     * is generated from the verify URL at render time. Required for `logo` by
     * the refinement below. */
    assetKey: z.string().min(1).optional(),
    x: normalised,
    y: normalised,
    width: normalised,
    align: alignSchema.default("left"),
    opacity: normalised.default(1)
  })
  .refine((field) => field.variable !== "logo" || (field.assetKey ?? "").trim().length > 0, {
    // A logo with nothing to draw renders as a blank gap on a credential the
    // learner shares publicly. Fail the publish, not the render.
    message: "a logo field must carry an assetKey",
    path: ["assetKey"]
  });
export type CertificateImageField = z.infer<typeof certificateImageFieldSchema>;

/**
 * Discriminated on `variable` rather than a plain z.union: a plain union tries
 * each member and reports the LAST failure, so a logo missing its assetKey
 * would be blamed on the text branch's missing `font`/`color` instead. The
 * discriminator routes on `variable` first, so the error names the real cause
 * and an unknown variable fails as an unknown variable.
 */
export const certificateFieldSchema = z.discriminatedUnion("variable", [
  certificateTextFieldSchema,
  certificateImageFieldSchema
]);
export type CertificateField = z.infer<typeof certificateFieldSchema>;

export const certificateTemplatePayloadSchema = z.object({
  kind: z.literal("certificate_template"),
  /**
   * Ships false. This flag — not the presence of the document — is what stops
   * placeholder artwork ever reaching a learner before the real design has been
   * seeded and reviewed.
   */
  enabled: z.boolean(),
  programmeName: z.string().trim().min(1).max(120),
  issuerName: z.string().trim().min(1).max(120),
  /** The background image the fields are positioned against. */
  assetKey: z.string().min(1),
  canvas: z.object({
    width: z.number().int().min(200).max(8000),
    height: z.number().int().min(200).max(8000)
  }),
  fields: z.array(certificateFieldSchema).min(1).max(20)
});
export type CertificateTemplatePayload = z.infer<typeof certificateTemplatePayloadSchema>;
