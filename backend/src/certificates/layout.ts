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
 * Escape order matters: `&` must go first. Escaping it last would turn the
 * `&lt;` this function just produced for a literal `<` into `&amp;lt;`,
 * double-encoding every character this function is supposed to neutralise.
 */
export function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/** Deliberately pessimistic: real glyph widths depend on font metrics this
 * module has no access to (no font is loaded here), so an average-width
 * guess is used instead. Pessimistic on purpose -- a size that lands a
 * little inside the box is safe, a size that overhangs it prints wrong. */
const AVG_GLYPH_RATIO = 0.55;

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

  const fitted = maxWidthPx / (text.length * AVG_GLYPH_RATIO);
  return Math.max(floorPx, fitted);
}

export function placeImage(canvas: Canvas, field: ImageFieldSpec, asset: { width: number; height: number }): PlacedBox {
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
