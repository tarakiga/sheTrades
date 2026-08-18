import sharp, { type OverlayOptions } from "sharp";
import { toString as qrCodeToString } from "qrcode";
import {
  certificateTemplatePayloadSchema,
  type CertificateImageField,
  type CertificateTemplatePayload,
  type CertificateTextField
} from "./contracts.js";
import { buildTextLayerSvg, placeImage, type Canvas, type TextValues } from "./layout.js";
import type { AssetLoader } from "./assets.js";

/**
 * Composites a completion certificate into a PNG: background artwork, then
 * the image fields (partner logos, verification QR) in template order, then
 * the text layer last so nothing can be drawn over the learner's name.
 *
 * The layout arithmetic and XML escaping live in layout.ts and are unit
 * tested without an image pipeline; this module owns only the I/O half --
 * loading assets, rasterising, and handing sharp a stack of overlays.
 *
 * The governing principle throughout is that a certificate which fails to
 * render is recoverable and one that renders WRONG is not. A certificate is
 * sent to the learner over WhatsApp, kept, shared, and backed by a public
 * verification page that will happily confirm a blank image is genuine. So
 * every missing input throws, named, rather than being skipped.
 *
 * One thing this module deliberately does NOT enforce: `template.enabled`.
 * That flag exists to stop placeholder artwork reaching a learner, but an
 * admin previewing an unpublished draft needs to render exactly the document
 * that flag is holding back -- so the gate belongs on the ISSUING path, not
 * here. Whoever wires issuance must check it; rendering is not consent to
 * deliver.
 */

export type RenderInput = {
  template: CertificateTemplatePayload;
  values: TextValues;
  verifyUrl: string;
  loadAsset: AssetLoader;
};

/** Bytes plus the asset's TRUE pixel dimensions, which is what placeImage
 * needs to derive a box that preserves the aspect ratio. */
type ImageSource = { bytes: Buffer; natural: { width: number; height: number } };

/**
 * Re-validates the template on the way in.
 *
 * getRuntimeCertificateTemplate() produces its value with `data as T` -- a
 * type ASSERTION, not a parse. The payload is validated when an admin
 * publishes it, but a document seeded straight into the database, or written
 * by an older version of the schema, is never re-checked on read. So the
 * static type here is a claim, not a guarantee, and acting on it unchecked
 * is how a template with (say) no canvas height reaches sharp and produces a
 * corrupt or wrongly-sized image instead of an error anyone can act on.
 *
 * Parsing rather than spot-checking also means a document stored before a
 * field gained a default still renders: zod fills the default in on the way
 * through.
 */
function parseTemplate(template: CertificateTemplatePayload): CertificateTemplatePayload {
  const parsed = certificateTemplatePayloadSchema.safeParse(template);
  if (parsed.success) return parsed.data;

  const detail = parsed.error.issues
    .map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`)
    .join("; ");
  throw new Error(`certificate template is malformed and cannot be rendered: ${detail}`);
}

async function loadQrSource(verifyUrl: string): Promise<ImageSource> {
  const url = verifyUrl.trim();
  if (url.length === 0) {
    // A QR that encodes nothing still looks like a QR on the artwork. The
    // learner would scan a credential that leads nowhere and have no way to
    // tell that from a certificate the verification page rejected.
    throw new Error("certificate template has a qrCode field but no verify URL to encode");
  }

  const svg = await qrCodeToString(url, { type: "svg", margin: 0 });
  // A QR symbol is square by definition, so 1x1 is its natural ratio --
  // placeImage derives the height from the configured width and this ratio.
  return { bytes: Buffer.from(svg), natural: { width: 1, height: 1 } };
}

async function loadLogoSource(field: CertificateImageField, loadAsset: AssetLoader): Promise<ImageSource> {
  // The schema already refuses to publish a logo field without an assetKey,
  // but a seeded document never went through that refinement (see
  // parseTemplate) -- and the type is optional here regardless.
  const key = field.assetKey?.trim() ?? "";
  if (key.length === 0) {
    throw new Error(`certificate template logo field "${field.id}" has no assetKey`);
  }

  const asset = await loadAsset(key);
  if (!asset) {
    throw new Error(`certificate template logo asset "${key}" is missing`);
  }
  return { bytes: asset.bytes, natural: { width: asset.width, height: asset.height } };
}

async function buildImageOverlay(
  canvas: Canvas,
  field: CertificateImageField,
  input: RenderInput
): Promise<OverlayOptions> {
  const source =
    field.variable === "qrCode" ? await loadQrSource(input.verifyUrl) : await loadLogoSource(field, input.loadAsset);

  const box = placeImage(canvas, field, source.natural);

  // Rasterised through sharp into PNG bytes rather than inlined as markup
  // into the text layer. An asset can legitimately BE an SVG (the QR always
  // is, and a partner logo may be), and an SVG is a document, not a
  // picture: inlining a hand-authored one would let it contribute elements
  // to the same layer that carries the learner's name -- a <text> of its
  // own, an overlapping rect, a redefined font. Rasterising first reduces
  // it to pixels, so the only layer that ever parses as markup is the one
  // this codebase writes.
  let image = sharp(source.bytes)
    // "fill", not "inside": placeImage has already sized the box to the
    // asset's true aspect ratio, so filling it exactly is correct. "inside"
    // re-derives the fit and can land a pixel short on rounding, leaving
    // the layout subtly and invisibly off.
    .resize(box.width, box.height, { fit: "fill" });

  if (field.opacity < 1) {
    // Multiply the alpha channel down by compositing a single translucent
    // pixel over the whole image with `dest-in`, which keeps the
    // destination and scales its alpha by the source's. ensureAlpha first,
    // or an opaque source (a JPEG logo) has no alpha channel to scale.
    image = image.ensureAlpha().composite([
      {
        input: Buffer.from([0, 0, 0, Math.round(field.opacity * 255)]),
        raw: { width: 1, height: 1, channels: 4 },
        tile: true,
        blend: "dest-in"
      }
    ]);
  }

  return { input: await image.png().toBuffer(), left: box.left, top: box.top };
}

export async function renderCertificatePng(input: RenderInput): Promise<Buffer> {
  const template = parseTemplate(input.template);
  const canvas: Canvas = template.canvas;

  const background = await input.loadAsset(template.assetKey);
  if (!background) {
    // Deliberately loud. Rendering the fields onto a blank canvas would
    // produce a plausible-looking certificate that is simply missing its
    // artwork -- and it would be issued, delivered and believed, because
    // nothing downstream inspects pixels. A 500 an admin can see beats a
    // credential nobody can tell is wrong.
    throw new Error(`certificate template background asset "${template.assetKey}" is missing`);
  }

  const textFields: CertificateTextField[] = [];
  const overlays: OverlayOptions[] = [];

  // Split on the schema's discriminant. The image cases are listed
  // explicitly so that adding a variable to either enum in contracts.ts
  // fails to compile here rather than silently falling into the text
  // branch and being asked for a font it does not have.
  for (const field of template.fields) {
    switch (field.variable) {
      case "logo":
      case "qrCode":
        overlays.push(await buildImageOverlay(canvas, field, input));
        break;
      default:
        textFields.push(field);
        break;
    }
  }

  if (textFields.length > 0) {
    // Last in the overlay list, so it composites ON TOP: a logo positioned
    // over the name field must never cover the name.
    overlays.push({ input: Buffer.from(buildTextLayerSvg(canvas, textFields, input.values)), left: 0, top: 0 });
  }

  // "cover", so artwork authored at a different aspect ratio fills the
  // canvas the field coordinates were normalised against instead of leaving
  // a border the layout does not account for.
  return sharp(background.bytes)
    .resize(canvas.width, canvas.height, { fit: "cover" })
    .composite(overlays)
    .png()
    .toBuffer();
}
