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
 * The four logo images were CROPPED OUT of that mockup, because only the
 * SheTrades rosette existed as a separate file. A useful consequence: each
 * crop carries the exact cream gradient it sat on, so compositing it back at
 * the coordinates it came from is seamless. If the partner originals ever
 * arrive, replace the assets under NEW keys - see assets.ts on why keys are
 * immutable.
 *
 * Typeface is DejaVu Sans, which is what the container has. The design uses a
 * rounded geometric sans, so the letterforms read plainer than the mockup.
 * Positions, sizes, colours and wrapping match; the type does not. Committing
 * a licensed brand font to the repo and republishing is the fix, and needs no
 * code change.
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
        font: "DejaVu Sans",
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
        font: "DejaVu Sans",
        size: 0.0228,
        weight: 400,
        color: "#1e1b18",
        autoShrink: true,
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
        font: "DejaVu Sans",
        size: 0.0172,
        weight: 700,
        color: "#1f1b1a",
        autoShrink: false
      },
      {
        id: "logo-rosette",
        variable: "logo",
        assetKey: "logo-sdp-rosette-v1",
        x: 0.4473,
        y: 0.7214,
        width: 0.127,
        align: "left"
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
        x: 0.155,
        y: 0.885,
        width: 0.058,
        align: "left"
      }
    ]
  });
