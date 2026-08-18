/**
 * Completion-certificate layout maths and SVG text-layer construction -- pure
 * functions, no `sharp`, no font, no database. The compositing task (I/O,
 * font loading, PNG rendering) sits on top of this; keeping this half free
 * of I/O is what makes coordinate arithmetic and XML escaping testable
 * without a real image pipeline. The two bug classes most likely to slip
 * through here -- a field landing a pixel outside its box, and learner input
 * breaking out of the SVG it is embedded in -- are exactly the ones this
 * module's tests target.
 */

export type Canvas = { width: number; height: number };

export type TextValues = {
  learnerName: string;
  programmeName: string;
  issuedDate: string;
  certificateId: string;
};

/** Mirrors the text-field shape from contracts.ts. Kept as a standalone type
 * (rather than importing CertificateTextField) so this module only depends
 * on the plain data it actually consumes, not on the zod schema that
 * produces it. `variable` is tied to `keyof TextValues` rather than to
 * contracts.ts's own variable enum so the two stay in lockstep by
 * construction: a variable this module cannot resolve a value for is a
 * compile error, not a runtime `undefined`. */
export type TextFieldSpec = {
  id: string;
  variable: keyof TextValues;
  x: number;
  y: number;
  maxWidth: number;
  align: "left" | "center" | "right";
  font: string;
  size: number;
  weight: number;
  color: string;
  autoShrink: boolean;
};

export type ImageFieldSpec = {
  x: number;
  y: number;
  width: number;
  align: "left" | "center" | "right";
};

export type PlacedBox = { left: number; top: number; width: number; height: number };

/**
 * XML 1.0 permits only #x9 | #xA | #xD | [#x20-#xD7FF] | [#xE000-#xFFFD] |
 * [#x10000-#x10FFFF]. Everything else -- stray control bytes, the two BMP
 * noncharacters, and a lone (unpaired) surrogate half -- is illegal at the
 * XML layer, escaped or not. A NUL byte here would make sharp's SVG
 * parser throw on render (breaking every certificate for that programme,
 * not just one field); a lone surrogate silently becomes U+FFFD when the
 * SVG is encoded to UTF-8. Struck BEFORE the entity escaping below, not
 * after: escaping only protects characters that were legal to begin with.
 *
 * A well-formed surrogate PAIR (a high surrogate immediately followed by
 * its low half -- an astral emoji in a programme name, say) is a
 * legitimate character and must survive; only an unpaired half is struck.
 *
 * Reachable from admin-authored config, not just learner input:
 * programmeName, issuerName, font and color come from an admin-editable
 * document and never pass through sanitiseLearnerName -- font in
 * particular has no length cap or character restriction at all.
 */
// eslint-disable-next-line no-control-regex -- the control range IS the point of this regex, not a mistake.
const ILLEGAL_XML_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F\uFFFE\uFFFF]/g;
const LONE_SURROGATE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g;

function stripIllegalXmlChars(value: string): string {
  return value.replace(ILLEGAL_XML_CHARS, "").replace(LONE_SURROGATE, "");
}

/**
 * Escape order matters: `&` must go first. Escaping it last would turn the
 * `&lt;` this function just produced for a literal `<` into `&amp;lt;`,
 * double-encoding every character this function is supposed to neutralise.
 */
export function escapeXml(value: string): string {
  return stripIllegalXmlChars(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/**
 * Upper bound on average glyph width as a fraction of font size. Real glyph
 * widths depend on font metrics this module has no access to (no font is
 * loaded here), so a per-character average stands in for measuring the text.
 *
 * MEASURED, not guessed. Rendered inside the deployment image (node:24-slim
 * plus fonts-dejavu-core, which is the face sharp actually falls back to)
 * over a corpus of 35 realistic learner names, programme names, dates and
 * certificate ids, taking ADVANCE width rather than ink so the side bearings
 * that decide overflow are included:
 *
 *   weight 400 (DejaVu Sans Book): median 0.574, max 0.695
 *   weight 700 (DejaVu Sans Bold): median 0.645, max 0.787
 *
 * The maximum in both cases is an all-capitals name (WEMIMO OLUWAMUYIWA).
 * Learners type their own names and a good number type them in capitals, so
 * that is a real case, not a contrived one. 0.8 sits above the observed
 * maximum with margin, which also leaves room for a brand font somewhat
 * wider than DejaVu.
 *
 * The previous value was 0.55, commented as "deliberately pessimistic". It
 * was neither. Against the bold figures above it under-estimated a real
 * name's true width by 15% at the median (0.55 against 0.645) and 30% at the
 * maximum (0.55 against 0.787), so fitFontSize reported that names fitted
 * which then overhung their box on a permanent, publicly shared credential
 * -- precisely the failure this function exists to prevent.
 *
 * Erring high is the safe direction: it shrinks text that would have fitted
 * (a name a little smaller than the designer intended, bounded below by
 * MIN_FONT_PX) rather than overflowing text that would not. Re-measure
 * against the real face when the brand artwork and its font land.
 */
const AVG_GLYPH_RATIO = 0.8;

/** Below this, text stops being legible on a printed/shared certificate. */
const MIN_FONT_PX = 24;

export function fitFontSize(args: { text: string; startPx: number; maxWidthPx: number }): number {
  const { text, startPx, maxWidthPx } = args;

  // The floor must never ENLARGE a field: a designer who set a line at 10px
  // (a certificate id, say) did that on purpose, and clamping it up to the
  // 24px legibility floor would blow the field out of its intended box. So
  // the effective floor is capped at startPx -- shrinking only ever moves
  // the size down from where the designer put it, never up past it.
  const floorPx = Math.min(MIN_FONT_PX, startPx);

  const estimatedWidth = text.length * startPx * AVG_GLYPH_RATIO;
  if (estimatedWidth <= maxWidthPx) return startPx;

  // Floored to a whole pixel, not left fractional: AVG_GLYPH_RATIO is
  // pessimistic specifically so the estimate lands INSIDE the box, and a
  // fractional size sitting exactly on the computed boundary spends that
  // margin. Flooring keeps the result on the conservative side of the
  // boundary instead of exactly on it. Also clamped to startPx so the
  // floor-then-max below can never push a fractional-but-still-too-big
  // value back up past where the designer started it.
  const fitted = maxWidthPx / (text.length * AVG_GLYPH_RATIO);
  let candidate = Math.floor(fitted);

  // Division and multiplication are not exact inverses in IEEE-754, and the
  // two do not even associate the same way: the solve above computes
  // (text.length * AVG_GLYPH_RATIO) first, while the "does this fit" check
  // computes (text.length * size) * AVG_GLYPH_RATIO. Those disagree by an
  // epsilon for a measurable slice of inputs. So re-check with the identical
  // multiplicative formula the "already fits" guard uses, and step once --
  // the check that decides "does this fit" is always the same check, never a
  // division assumed to invert it exactly.
  //
  // BOTH directions are needed. Only the step-down existed while
  // AVG_GLYPH_RATIO was 0.55, where it happened to be sufficient; raising the
  // constant to 0.8 immediately produced inputs that floored a whole pixel
  // BELOW a size that fits (text.length 3, maxWidthPx 300: the division
  // yields 124.99999999999999 where 125 multiplies back to exactly 300).
  // A closed form that is correct only for one value of a tunable constant
  // is not correct, so the recovery is symmetric.
  if (candidate * text.length * AVG_GLYPH_RATIO > maxWidthPx) {
    candidate -= 1;
  } else if ((candidate + 1) * text.length * AVG_GLYPH_RATIO <= maxWidthPx) {
    candidate += 1;
  }

  return Math.max(floorPx, Math.min(startPx, candidate));
}

export function placeImage(canvas: Canvas, field: ImageFieldSpec, asset: { width: number; height: number }): PlacedBox {
  // asset.width/height come from probing an uploaded file, not from a
  // schema-bounded field like the canvas dimensions -- nothing upstream
  // guarantees they are positive. A zero width would divide-by-zero into
  // Infinity below (0x0 into NaN), and both would flow straight into
  // sharp.resize() in the compositing step. Throwing here, loud and named,
  // beats the alternative for the same reason a missing background image
  // throws rather than rendering blank: a certificate that fails visibly is
  // recoverable; one that silently renders wrong is not.
  if (!(asset.width > 0) || !(asset.height > 0)) {
    throw new Error(`placeImage: asset has invalid dimensions ${asset.width}x${asset.height}`);
  }

  const width = Math.round(field.width * canvas.width);
  // Derived from the asset's own aspect ratio, not an independent height
  // field: a stretched partner logo on a public credential is worse than no
  // logo at all.
  const height = Math.round((width * asset.height) / asset.width);
  const top = Math.round(field.y * canvas.height);
  const anchor = field.x * canvas.width;

  let left: number;
  switch (field.align) {
    case "left":
      left = Math.round(anchor);
      break;
    case "center":
      left = Math.round(anchor - width / 2);
      break;
    case "right":
      left = Math.round(anchor - width);
      break;
  }

  return { left, top, width, height };
}

const TEXT_ANCHOR: Record<TextFieldSpec["align"], string> = {
  left: "start",
  center: "middle",
  right: "end"
};

export function buildTextLayerSvg(canvas: Canvas, fields: TextFieldSpec[], values: TextValues): string {
  const textElements = fields
    .map((field) => {
      const value = values[field.variable];
      const startPx = Math.round(field.size * canvas.height);
      const maxWidthPx = Math.round(field.maxWidth * canvas.width);
      const fontSize = field.autoShrink ? fitFontSize({ text: value, startPx, maxWidthPx }) : startPx;

      const x = Math.round(field.x * canvas.width);
      const y = Math.round(field.y * canvas.height);

      // Every interpolated value is escaped, including font and color: they
      // are admin-authored, not learner-authored, but "escape everything at
      // the boundary" is a rule that stays true forever, where "escape only
      // the fields that are risky today" quietly rots the moment a new field
      // is added upstream.
      return (
        `<text x="${x}" y="${y}" text-anchor="${TEXT_ANCHOR[field.align]}" ` +
        `font-family="${escapeXml(field.font)}" font-size="${fontSize}" ` +
        `font-weight="${field.weight}" fill="${escapeXml(field.color)}">` +
        `${escapeXml(value)}</text>`
      );
    })
    .join("");

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${canvas.width}" height="${canvas.height}">${textElements}</svg>`;
}
