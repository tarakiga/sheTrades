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
 * The document lives in the `integration` namespace with type
 * `integration_config` and key `certificate.template`, following the
 * reward-rules precedent. Those two choices do separate jobs and neither
 * implies the other:
 *
 *   - NAMESPACE is what makes the document readable at runtime.
 *     refreshRuntimeConfigCache() lists `namespace: "integration"` and caches
 *     every published, active document by key; it never inspects `type`. This
 *     is also why reward.rules.primary is reachable through
 *     getRuntimeIntegrationConfig despite its key not starting with
 *     `integration.` — the key prefix is a naming convention, not a mechanism.
 *
 *   - TYPE is what gets the payload validated on the way in.
 *     validatePayloadForDocumentType (service.ts / postgres-service.ts) parses
 *     against integrationConfigPayloadSchema only when the type is
 *     `integration_config`, which is why the schema below MUST be a member of
 *     that union. A document typed `ui_copy` in this namespace would still be
 *     cached and readable at runtime — it would just have been stored without
 *     ever being validated.
 *
 * The `kind: "certificate_template"` literal is what keeps this payload
 * distinguishable inside that union, mirroring reward_rules.
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
  "certificateId",
  /** The wrapped paragraph under the learner's name. Unlike the four above it
   * resolves to no value from the certificate record -- it carries its own
   * `text`, because the sentence is template copy an admin writes, not a fact
   * about the learner. It is in this enum anyway so that it routes through the
   * same text half of the layout as everything else that is drawn as type. */
  "bodyText"
]);

/** How an `issuedDate` renders. A closed set rather than a strftime-style
 * pattern string: an admin needs to pick a house style, not to be handed a
 * mini-language in which "%M" silently means minutes. */
export const certificateDateFormatSchema = z.enum(["iso", "long-ordinal"]);
export type CertificateDateFormat = z.infer<typeof certificateDateFormatSchema>;

/** Everything a drawn-text field shares, whatever it draws. Spread into the
 * branches below rather than extended, so each branch stays a plain z.object
 * and therefore stays legal as a member of a discriminated union. */
const textFieldShape = {
  id: z.string().min(1),
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
};

/**
 * The three text branches exist so that a property is only accepted where it
 * MEANS something. `maxLines` on a learner name, or `format` on a certificate
 * id, would parse happily into a single shared schema and then be ignored by
 * the renderer -- config that looks like it does something and does not, which
 * is the class of bug an admin has no way to diagnose. Splitting the branches
 * makes zod strip such a key instead of storing it.
 *
 * The variable sets are DERIVED from certificateTextVariableSchema by
 * exclusion rather than restated, so adding a variable to that enum without
 * giving it a branch is caught here rather than at render time.
 */
const certificateSimpleTextFieldSchema = z.object({
  variable: certificateTextVariableSchema.exclude(["issuedDate", "bodyText"]),
  ...textFieldShape
});

const certificateDateFieldSchema = z.object({
  variable: z.literal("issuedDate"),
  ...textFieldShape,
  /**
   * Defaults to `iso`, not to the prettier `long-ordinal` the delivered
   * artwork uses. An unconfigured template should render the date it was
   * given, unchanged and unambiguous: `iso` is the identity transform on the
   * value the resolver supplies, so it needs no month table, no ordinal rules
   * and no locale, and it cannot be misread as day-first or month-first by
   * anyone. Choosing the English long form is a presentational decision, and
   * presentational decisions on a credential should be made deliberately by
   * whoever authors the template, not inherited by silence.
   */
  format: certificateDateFormatSchema.default("iso")
});

const certificateBodyTextFieldSchema = z.object({
  variable: z.literal("bodyText"),
  ...textFieldShape,
  /** The paragraph itself, with optional `**bold**` runs. Capped so an
   * accidental paste cannot produce a wall of type no shrink can rescue. */
  text: z.string().trim().min(1).max(600),
  /** Leading, as a multiple of the font size -- normalised for the same reason
   * every other measurement here is. Floored at 1.0: below single spacing the
   * lines overlap, which no design wants and which reads as a rendering
   * fault rather than a tight setting. */
  lineHeight: z.number().min(1).max(3).default(1.4),
  /** The renderer shrinks the paragraph until it wraps within this many lines.
   * If it cannot even at the legibility floor, the text OVERFLOWS rather than
   * being truncated -- see fitWrappedText in layout.ts for why. */
  maxLines: z.number().int().min(1).max(12).default(4)
});

export type CertificateTextField =
  | z.infer<typeof certificateSimpleTextFieldSchema>
  | z.infer<typeof certificateDateFieldSchema>
  | z.infer<typeof certificateBodyTextFieldSchema>;

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
 * Discriminated on `variable` rather than a plain z.union, so that branch
 * routing — and therefore the error an admin is shown — is deterministic.
 *
 * A plain union would mostly work: zod v4 picks a best-match branch by fewest
 * issues, and for a logo missing its assetKey that does surface the single
 * correct error today. But it is a heuristic, not a guarantee, and it degrades
 * badly when branches score comparably — it then emits a merged `invalid_union`
 * carrying every branch's failures, so someone who simply typo'd `variable`
 * gets the text branch's missing-`font`/`size`/`color` complaints piled on top
 * of the real cause. Discriminating makes `variable` decide the branch
 * outright, so a bad field is always reported against the branch it was
 * actually written for.
 */
export const certificateFieldSchema = z.discriminatedUnion("variable", [
  certificateSimpleTextFieldSchema,
  certificateDateFieldSchema,
  certificateBodyTextFieldSchema,
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
