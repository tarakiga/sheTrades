import { certificateTemplatePayloadSchema, type CertificateTemplatePayload } from "./contracts.js";

/**
 * A minimal, valid template over a freshly uploaded background.
 *
 * This exists so the editor has something to open on a system where no
 * template document has ever been created. The alternative — an empty canvas —
 * would put an admin in front of a blank rectangle with no way to discover that
 * a certificate needs a name, a date and something to verify it by.
 *
 * Deliberately NOT the delivered SheTrades design. That one lives in
 * template-default.ts, is measured against specific artwork, and references
 * partner logos that exist as seeded assets; reproducing it over somebody
 * else's background would place five logos at coordinates that mean nothing.
 * So the starter carries only what every certificate needs, positioned in the
 * middle of the page where it is obviously provisional and obviously draggable.
 *
 * Pure: the caller supplies the background's real dimensions, and the canvas
 * takes them, so the coordinates below denormalise against the artwork actually
 * uploaded rather than against an assumed aspect ratio.
 */
export function buildStarterTemplate(input: {
  assetKey: string;
  width: number;
  height: number;
  programmeName: string;
  issuerName: string;
}): CertificateTemplatePayload {
  return certificateTemplatePayloadSchema.parse({
    kind: "certificate_template",
    // Same reason as the delivered template: a brand-new layout nobody has
    // looked at yet must not be able to issue anything.
    enabled: false,
    programmeName: input.programmeName,
    issuerName: input.issuerName,
    assetKey: input.assetKey,
    canvas: { width: input.width, height: input.height },
    fields: [
      {
        id: "learner-name",
        variable: "learnerName",
        x: 0.5,
        y: 0.44,
        maxWidth: 0.72,
        align: "center",
        font: "Roboto",
        size: 0.058,
        weight: 700,
        color: "#1a1a1a",
        autoShrink: true
      },
      {
        id: "citation",
        variable: "bodyText",
        text: "has successfully completed every module of this programme.",
        x: 0.5,
        y: 0.56,
        maxWidth: 0.66,
        align: "center",
        font: "Roboto",
        size: 0.024,
        weight: 400,
        color: "#333333",
        lineHeight: 1.4,
        maxLines: 3,
        // Prose, not a shouted name — see the field's own note in contracts.ts
        // on why one glyph ratio cannot serve both.
        glyphRatio: 0.48
      },
      {
        id: "issued-date",
        variable: "issuedDate",
        // Chosen rather than inherited. The schema defaults to `iso` on
        // purpose, but a starter template is somebody AUTHORING a design, and
        // a printed credential reads better with the long form than with
        // 2026-08-18.
        format: "long-ordinal",
        x: 0.5,
        y: 0.7,
        maxWidth: 0.5,
        align: "center",
        font: "Roboto",
        size: 0.022,
        weight: 400,
        color: "#333333"
      },
      {
        id: "certificate-id",
        variable: "certificateId",
        x: 0.5,
        y: 0.94,
        maxWidth: 0.5,
        align: "center",
        font: "Roboto",
        size: 0.012,
        weight: 400,
        color: "#888888",
        // A reference number that shrinks is a reference number that stops
        // matching the one on the verification page.
        autoShrink: false
      },
      {
        id: "verify-qr",
        variable: "qrCode",
        x: 0.86,
        y: 0.78,
        width: 0.08,
        align: "left",
        opacity: 1
      }
    ]
  });
}
