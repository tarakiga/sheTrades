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

/** How an `issuedDate` field is rendered. Mirrors contracts.ts's own enum;
 * kept as a standalone literal union for the same reason as the field types
 * below -- this module consumes plain data, never the zod schema. */
export type DateFormat = "iso" | "long-ordinal";

/** The styling and geometry every text field shares, whatever it draws. */
type TextFieldBase = {
  id: string;
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

/** Mirrors the text-field shapes from contracts.ts. Kept as standalone types
 * (rather than importing CertificateTextField) so this module only depends
 * on the plain data it actually consumes, not on the zod schema that
 * produces it. `variable` is tied to `keyof TextValues` rather than to
 * contracts.ts's own variable enum so the two stay in lockstep by
 * construction: a variable this module cannot resolve a value for is a
 * compile error, not a runtime `undefined`. */
export type ValueTextFieldSpec = TextFieldBase & {
  variable: Exclude<keyof TextValues, "issuedDate">;
};

/** Split out purely so `format` exists only where it means something. A
 * `format` on a learner name would be config that looks like it does
 * something and does not. */
export type DateTextFieldSpec = TextFieldBase & {
  variable: "issuedDate";
  /** Optional so a field authored before this existed still renders -- see
   * formatDateValue, where absent means "leave the value exactly as it
   * arrived". */
  format?: DateFormat;
};

/**
 * The wrapped paragraph. Its text is NOT a member of TextValues: the
 * paragraph is admin-authored template copy, the same class of thing as the
 * font and the colour, not a per-certificate fact like the learner's name. It
 * therefore travels on the field, which also means it is frozen into
 * Certificate.templateSnapshot and cannot be reworded under a credential
 * already issued.
 */
export type BodyTextFieldSpec = TextFieldBase & {
  variable: "bodyText";
  /** May carry `**bold**` runs. See parseInlineBold. */
  text: string;
  /** A multiple of the font size, so the leading scales with the render the
   * same way every other measurement in this module does. */
  lineHeight: number;
  maxLines: number;
};

export type TextFieldSpec = ValueTextFieldSpec | DateTextFieldSpec | BodyTextFieldSpec;

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

/**
 * How much wider a weight-700 run is than the same characters at weight 400.
 *
 * DERIVED FROM AVG_GLYPH_RATIO, not measured separately, and that is the
 * point: a second independent width model would drift from the first and only
 * one of them would be right. The multiplier is the weight-400 to weight-700
 * SPREAD from the same DejaVu measurement documented above -- 0.645/0.574 =
 * 1.124 at the median, 0.787/0.695 = 1.132 at the maximum -- rounded up to
 * 1.15 for the same margin AVG_GLYPH_RATIO itself carries.
 *
 * Applying it gives bold runs an effective 0.92, which sits above the
 * measured bold maximum (0.787) by 17%, close to the 15% margin
 * AVG_GLYPH_RATIO gives regular text over ITS maximum (0.695). So both
 * weights are equally conservative rather than bold being measured at the
 * very edge of the observed range.
 *
 * Note this deliberately does NOT feed fitFontSize: a weight-700 single-line
 * field is still measured at the flat 0.8, which is where it has always been
 * measured. Changing that would resize the learner's name on every existing
 * template, which is a separate decision from adding a paragraph.
 */
const BOLD_WIDTH_MULTIPLIER = 1.15;

/** A run of characters sharing one weight. The unit both the wrap and the
 * escaping work in -- which is what keeps "every segment is escaped" a
 * property of the type rather than a habit of the caller. */
export type TextSegment = { text: string; bold: boolean };

const BOLD_MARKER = "**";

/**
 * Splits `**bold**` runs out of admin-authored copy, the same markdown
 * convention the WhatsApp copy in this codebase already uses.
 *
 * Degrades, never throws. An unmatched marker, or an empty pair, stays in the
 * output as literal text: this string comes from a config document a human
 * edits, and a typo there must cost one ugly certificate, not every
 * certificate on the programme. The markers are also the ONLY thing this
 * function interprets -- it never decides anything about escaping, which
 * happens later, per segment, so no parse path can put raw text in front of
 * the XML parser.
 */
export function parseInlineBold(source: string): TextSegment[] {
  const segments: TextSegment[] = [];
  let plain = "";
  let index = 0;

  while (index < source.length) {
    if (source.startsWith(BOLD_MARKER, index)) {
      const close = source.indexOf(BOLD_MARKER, index + BOLD_MARKER.length);
      const inner = close === -1 ? "" : source.slice(index + BOLD_MARKER.length, close);
      if (close !== -1 && inner.length > 0) {
        if (plain.length > 0) {
          segments.push({ text: plain, bold: false });
          plain = "";
        }
        segments.push({ text: inner, bold: true });
        index = close + BOLD_MARKER.length;
        continue;
      }
      // Unmatched, or an empty pair. Literal.
      plain += BOLD_MARKER;
      index += BOLD_MARKER.length;
      continue;
    }
    plain += source.charAt(index);
    index += 1;
  }

  if (plain.length > 0) segments.push({ text: plain, bold: false });
  return segments;
}

/**
 * The ONE width model. Both the greedy wrap and any caller checking a result
 * measure through this function, so a line the wrap accepted can never be a
 * line a later check calls too wide.
 */
export function estimateLineWidthPx(line: TextSegment[], fontSizePx: number): number {
  return line.reduce((total, segment) => {
    const base = segment.text.length * fontSizePx * AVG_GLYPH_RATIO;
    return total + (segment.bold ? base * BOLD_WIDTH_MULTIPLIER : base);
  }, 0);
}

/** One whitespace-free word, as the (possibly several) weighted runs it spans
 * -- `**Programme**s` is a single word carrying two. */
type Token = TextSegment[];

function tokenise(segments: TextSegment[]): Token[] {
  const tokens: Token[] = [];
  let current: Token = [];
  let buffer = "";

  for (const segment of segments) {
    // Iterating the string yields whole code points, so an astral character
    // is never split into its surrogate halves mid-word.
    for (const character of segment.text) {
      // No regex: `trim()` is the whitespace definition JavaScript already
      // agrees on, including the exotic spaces a paste from a design tool
      // brings with it.
      if (character.trim().length === 0) {
        if (buffer.length > 0) {
          current.push({ text: buffer, bold: segment.bold });
          buffer = "";
        }
        if (current.length > 0) {
          tokens.push(current);
          current = [];
        }
        continue;
      }
      buffer += character;
    }
    if (buffer.length > 0) {
      current.push({ text: buffer, bold: segment.bold });
      buffer = "";
    }
  }

  if (current.length > 0) tokens.push(current);
  return tokens;
}

/** Appends text to a line, merging into the previous run when the weight is
 * unchanged. Merging is not cosmetic: it is what keeps a multi-word bold
 * phrase one `<tspan>` instead of one per word. */
function appendRun(pieces: TextSegment[], text: string, bold: boolean): TextSegment[] {
  const last = pieces[pieces.length - 1];
  if (last !== undefined && last.bold === bold) {
    return [...pieces.slice(0, -1), { text: last.text + text, bold }];
  }
  return [...pieces, { text, bold }];
}

function appendToken(pieces: TextSegment[], token: Token): TextSegment[] {
  let next = pieces;
  const last = next[next.length - 1];
  if (last !== undefined) {
    // The separating space rides on the END of the run before it rather than
    // becoming a run of its own, so a bold phrase stays contiguous. A line is
    // therefore never built with a trailing space -- the space is only added
    // when a further word actually joins the line.
    next = [...next.slice(0, -1), { text: last.text + " ", bold: last.bold }];
  }
  for (const piece of token) next = appendRun(next, piece.text, piece.bold);
  return next;
}

/**
 * Greedy word wrap at a GIVEN font size. Pure: text in, lines out.
 *
 * A word wider than the whole line gets a line to itself and overhangs it,
 * rather than being broken mid-word. That is deliberate and it is about
 * names: a hyphenated Nigerian surname split across two lines prints a name
 * its owner does not have, permanently, on a credential she shares. An
 * overhang is visibly wrong and fixable; a mangled name looks intentional.
 */
export function wrapRichText(args: { text: string; maxWidthPx: number; fontSizePx: number }): TextSegment[][] {
  const tokens = tokenise(parseInlineBold(args.text));
  const lines: TextSegment[][] = [];
  let current: TextSegment[] = [];

  for (const token of tokens) {
    const candidate = appendToken(current, token);
    if (current.length > 0 && estimateLineWidthPx(candidate, args.fontSizePx) > args.maxWidthPx) {
      lines.push(current);
      current = appendToken([], token);
      continue;
    }
    current = candidate;
  }

  if (current.length > 0) lines.push(current);
  return lines;
}

/**
 * Resolves the circular bit: the font size decides the wrap, and the wrap
 * decides whether the result fits inside `maxLines`.
 *
 * Solved by scanning down one pixel at a time and re-wrapping, rather than by
 * a closed form like fitFontSize's. There is no closed form here -- line count
 * is a step function of font size with the steps in places that depend on the
 * word lengths -- and a binary search would have to assume that line count is
 * monotone in font size, which is true of greedy wrapping in principle but is
 * not something this module can check. The scan is bounded by
 * (startPx - floor) iterations over a schema-capped string, and rendered
 * certificates are cached, so the honest version is affordable.
 *
 * WHEN IT STILL DOES NOT FIT at the legibility floor, the text OVERFLOWS --
 * every line is returned, none is dropped, nothing is replaced by an
 * ellipsis. Truncating would be worse in the way that matters: the paragraph
 * is a statement about what the learner achieved, and a truncated sentence
 * still reads as a complete sentence, so nobody looking at the certificate --
 * not the learner, not an employer, not the admin who published it -- can
 * tell that words are missing. An overflowing paragraph is unmistakable on
 * sight and gets fixed. The string is admin-authored config with a length cap
 * in the schema, not learner input, so "a human can fix it" is a real remedy
 * here and the overflow is bounded rather than open-ended.
 */
export function fitWrappedText(args: {
  text: string;
  maxWidthPx: number;
  startPx: number;
  maxLines: number;
}): { fontSizePx: number; lines: TextSegment[][] } {
  // Same rule as fitFontSize: shrinking never ENLARGES a field the designer
  // deliberately made small.
  const floorPx = Math.min(MIN_FONT_PX, args.startPx);

  const fits = (lines: TextSegment[][], fontSizePx: number): boolean =>
    lines.length <= args.maxLines &&
    lines.every((line) => estimateLineWidthPx(line, fontSizePx) <= args.maxWidthPx);

  let fontSizePx = args.startPx;
  let lines = wrapRichText({ text: args.text, maxWidthPx: args.maxWidthPx, fontSizePx });

  while (fontSizePx > floorPx && !fits(lines, fontSizePx)) {
    fontSizePx -= 1;
    lines = wrapRichText({ text: args.text, maxWidthPx: args.maxWidthPx, fontSizePx });
  }

  return { fontSizePx, lines };
}

/**
 * Hardcoded rather than taken from Intl. `long-ordinal` is an English-language
 * construct -- "23rd" has no meaning outside it -- so a different language
 * needs a different FORMAT token, not the same token with a swapped month
 * table. Intl would also drag locale data and a time zone into what is
 * otherwise a pure string transform.
 */
const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December"
];

/** Matches the calendar part of an ISO-8601 date, ignoring any time that
 * follows it. Deliberately not `new Date(...)`: parsing through Date makes the
 * result depend on the host time zone, which is how a certificate issued late
 * on the 23rd comes out dated the 22nd. */
const ISO_DATE_PREFIX = /^([0-9]{4})-([0-9]{2})-([0-9]{2})/;

function ordinalSuffix(day: number): string {
  // The teens are the whole trick: 11, 12 and 13 take "th" despite ending in
  // 1, 2 and 3, which is exactly what a bare `day % 10` gets wrong.
  const withinCentury = day % 100;
  if (withinCentury >= 11 && withinCentury <= 13) return "th";

  switch (day % 10) {
    case 1:
      return "st";
    case 2:
      return "nd";
    case 3:
      return "rd";
    default:
      return "th";
  }
}

/**
 * Applies a template's configured date format to the already-resolved date
 * string. Pure, and the only place the certificate's date presentation is
 * decided.
 *
 * A value that is not an ISO date PASSES THROUGH unchanged rather than
 * throwing or rendering "Invalid Date". The value is produced by this
 * codebase, not by a learner, so a mismatch is our own bug -- but the raw
 * value is still a truthful, human-readable date, whereas a throw takes down
 * the render of a credential someone is waiting for and "Invalid Date" is a
 * lie printed on it. Same rule as everywhere else in this feature, applied
 * honestly: fail loud when the alternative is WRONG output, degrade when the
 * alternative is merely UNSTYLED output.
 *
 * An absent format means "leave it exactly as it arrived", which is what a
 * field authored before this option existed gets.
 */
export function formatDateValue(value: string, format: DateFormat | undefined): string {
  if (format === undefined) return value;

  const match = value.match(ISO_DATE_PREFIX);
  const year = match?.[1];
  const month = match?.[2];
  const day = match?.[3];
  if (year === undefined || month === undefined || day === undefined) return value;

  const monthNumber = Number(month);
  const dayNumber = Number(day);
  if (monthNumber < 1 || monthNumber > 12 || dayNumber < 1 || dayNumber > 31) return value;

  if (format === "iso") return `${year}-${month}-${day}`;

  const monthName = MONTH_NAMES[monthNumber - 1];
  if (monthName === undefined) return value;
  return `${monthName} ${dayNumber}${ordinalSuffix(dayNumber)}, ${year}`;
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

/** The value a single-line field draws. The date is the only variable whose
 * presentation is configurable, and this is where that configuration is
 * applied -- BEFORE fitFontSize sees the string, so a field is sized against
 * the text that will actually be drawn rather than against the raw value.
 * "August 23rd, 2026" is 70% wider than "2026-08-23". */
function resolveTextValue(field: ValueTextFieldSpec | DateTextFieldSpec, values: TextValues): string {
  if (field.variable === "issuedDate") return formatDateValue(values.issuedDate, field.format);
  return values[field.variable];
}

/**
 * Every interpolated value is escaped, including font and color: they are
 * admin-authored, not learner-authored, but "escape everything at the
 * boundary" is a rule that stays true forever, where "escape only the fields
 * that are risky today" quietly rots the moment a new field is added
 * upstream.
 */
function textStyleAttributes(field: TextFieldSpec, fontSizePx: number): string {
  return (
    `font-family="${escapeXml(field.font)}" font-size="${fontSizePx}" ` +
    `font-weight="${field.weight}" fill="${escapeXml(field.color)}"`
  );
}

/** One line's runs. A bold run becomes a nested `<tspan>` with NO `x` of its
 * own, so it continues the line's text chunk instead of starting a new one --
 * giving it an `x` would re-anchor it and pile every bold run on top of the
 * line's start. Escaping happens here, per segment: the bold split above
 * produced plain strings and made no promises about their contents. */
function renderLineSegments(line: TextSegment[]): string {
  return line
    .map((segment) =>
      segment.bold ? `<tspan font-weight="700">${escapeXml(segment.text)}</tspan>` : escapeXml(segment.text)
    )
    .join("");
}

/**
 * A wrapped paragraph: one `<text>` carrying one `<tspan>` per line.
 *
 * Each line tspan repeats the field's `x`, which is what makes it its own
 * text chunk -- and therefore what keeps `text-anchor` working per line, so
 * a centred paragraph is centred line by line rather than as one ragged
 * block. `y` on the `<text>` remains the FIRST baseline, exactly as it is for
 * a single-line field, so an admin positions a paragraph the same way she
 * positions a name and the block grows downward from there.
 *
 * `xml:space="preserve"` is load-bearing, not decoration. With the default
 * whitespace handling an SVG renderer may strip the space at the end of a
 * tspan, which is precisely where the space before a bold run lives -- "the
 * SheTrades" would render as "theSheTrades". This module emits no incidental
 * whitespace of its own, so preserving is safe.
 */
function buildBodyElement(field: BodyTextFieldSpec, x: number, y: number, startPx: number, maxWidthPx: number): string {
  const wrapped = field.autoShrink
    ? fitWrappedText({ text: field.text, maxWidthPx, startPx, maxLines: field.maxLines })
    : { fontSizePx: startPx, lines: wrapRichText({ text: field.text, maxWidthPx, fontSizePx: startPx }) };

  const leadingPx = Math.round(field.lineHeight * wrapped.fontSizePx);
  const tspans = wrapped.lines
    .map((line, index) => `<tspan x="${x}" dy="${index === 0 ? 0 : leadingPx}">${renderLineSegments(line)}</tspan>`)
    .join("");

  return (
    `<text x="${x}" y="${y}" text-anchor="${TEXT_ANCHOR[field.align]}" xml:space="preserve" ` +
    `${textStyleAttributes(field, wrapped.fontSizePx)}>${tspans}</text>`
  );
}

export function buildTextLayerSvg(canvas: Canvas, fields: TextFieldSpec[], values: TextValues): string {
  const textElements = fields
    .map((field) => {
      const startPx = Math.round(field.size * canvas.height);
      const maxWidthPx = Math.round(field.maxWidth * canvas.width);
      const x = Math.round(field.x * canvas.width);
      const y = Math.round(field.y * canvas.height);

      if (field.variable === "bodyText") return buildBodyElement(field, x, y, startPx, maxWidthPx);

      const value = resolveTextValue(field, values);
      const fontSize = field.autoShrink ? fitFontSize({ text: value, startPx, maxWidthPx }) : startPx;

      return (
        `<text x="${x}" y="${y}" text-anchor="${TEXT_ANCHOR[field.align]}" ` +
        `${textStyleAttributes(field, fontSize)}>${escapeXml(value)}</text>`
      );
    })
    .join("");

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${canvas.width}" height="${canvas.height}">${textElements}</svg>`;
}
