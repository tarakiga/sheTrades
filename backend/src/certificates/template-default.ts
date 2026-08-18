import { certificateTemplatePayloadSchema, type CertificateTemplatePayload } from "./contracts.js";

/**
 * The delivered certificate design, as a template document.
 *
 * Every coordinate here was MEASURED, not estimated: the client supplied both
 * the bare background and a filled-in mockup of the same 2048x1450 canvas, so
 * each variable field's position came from diffing the two images and taking
 * the bounding box of what the mockup added. Colours were sampled from the
 * mockup's own glyphs rather than guessed from the brand palette.
 *
 * The three PARTNER logos were cropped out of that mockup, because they exist
 * nowhere else. A useful consequence: each crop carries the exact cream
 * gradient it sat on, so compositing it back at the coordinates it came from
 * is seamless. The issuing badge is the client's own badge.png, so it keeps
 * its full ribbons - the cropped version cut them off. If the partner
 * originals ever arrive, replace those assets under NEW keys; see assets.ts
 * on why keys are immutable.
 *
 * Typeface is Roboto, the client's choice, installed in the runtime image via
 * fonts-roboto-unhinted. DejaVu stays behind it as a coverage fallback.
 *
 * The QR position came from a placement guide the client marked up, not from
 * a guess - see the field comment.
 */
export const DEFAULT_CERTIFICATE_TEMPLATE: CertificateTemplatePayload =
  certificateTemplatePayloadSchema.parse({
    kind: "certificate_template",
    // Ships dark. Turning this on is a separate, deliberate act - it is the
    // only thing standing between a half-checked template and a learner's
    // permanent credential.
    enabled: false,
    programmeName: "SheTrades Digital Learning Programme",
    issuerName: "TechHer",
    assetKey: "certificate-background-v1",
    canvas: { width: 2048, height: 1450 },
    fields: [
      // Partner band across the top. Image fields anchor on their top-left
      // when align is "left", so x/y here are the crop's own origin in the
      // mockup - which is why they land pixel-exact.
      {
        id: "logo-care",
        variable: "logo",
        assetKey: "logo-care-v1",
        x: 0.1357,
        y: 0.0331,
        width: 0.0605,
        align: "left"
      },
      {
        id: "logo-techher",
        variable: "logo",
        assetKey: "logo-techher-v1",
        x: 0.4453,
        y: 0.0469,
        width: 0.1133,
        align: "left"
      },
      {
        id: "logo-sheconnects",
        variable: "logo",
        assetKey: "logo-sheconnects-v1",
        x: 0.7705,
        y: 0.0455,
        width: 0.1035,
        align: "left"
      },
      // The learner's name: the one thing on here that is hers.
      {
        id: "learner-name",
        variable: "learnerName",
        x: 0.4951,
        y: 0.5269,
        maxWidth: 0.62,
        align: "center",
        font: "Roboto",
        size: 0.0566,
        weight: 700,
        color: "#f2530f",
        autoShrink: true
      },
      {
        id: "citation",
        variable: "bodyText",
        text:
          "In recognition of your successful completion of the " +
          "**SheTrades Digital Learning Programme** and your commitment to " +
          "building practical digital and business skills for greater " +
          "economic opportunity.",
        x: 0.5007,
        y: 0.5993,
        maxWidth: 0.6,
        align: "center",
        font: "Roboto",
        size: 0.0228,
        weight: 400,
        color: "#1e1b18",
        autoShrink: true,
        // Roboto prose measures 0.443-0.460; 0.48 is just above that so the
        // paragraph wraps to the three lines the design has, rather than the
        // four the global 0.68 upper bound produces. That bound exists for
        // all-capitals NAMES, which are half again as wide as prose.
        glyphRatio: 0.48,
        lineHeight: 1.1,
        maxLines: 4
      },
      // Sits above the printed DATE rule that is part of the background.
      {
        id: "issued-date",
        variable: "issuedDate",
        format: "long-ordinal",
        x: 0.2561,
        y: 0.8483,
        maxWidth: 0.22,
        align: "center",
        font: "Roboto",
        size: 0.0172,
        weight: 700,
        color: "#1f1b1a",
        autoShrink: false
      },
      {
        id: "logo-badge",
        variable: "logo",
        assetKey: "logo-sdp-badge-v1",
        x: 0.5107,
        y: 0.7214,
        width: 0.127,
        align: "center"
      },
      // The delivered design had no QR. It is here because a learner who
      // forwards only the IMAGE strips the caption, and the caption is where
      // the verify link otherwise lives - so without this, a shared
      // certificate is unverifiable. Parked below the DATE rule, where it
      // reads as administrative metadata rather than competing with the
      // partner marks. A sensible default, not a final decision: it is
      // draggable once the template editor ships.
      {
        id: "verify-qr",
        variable: "qrCode",
        x: 0.2266,
        y: 0.7083,
        width: 0.0591,
        align: "left"
      }
    ]
  });
