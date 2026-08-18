import test from "node:test";
import assert from "node:assert/strict";
import {
  buildTextLayerSvg,
  escapeXml,
  estimateLineWidthPx,
  fitFontSize,
  fitWrappedText,
  formatDateValue,
  parseInlineBold,
  placeImage,
  wrapRichText,
  type TextSegment
} from "./layout.js";

const CANVAS = { width: 2000, height: 1414 };

const NAME_FIELD = {
  id: "n",
  variable: "learnerName" as const,
  x: 0.5,
  y: 0.5,
  maxWidth: 0.8,
  align: "center" as const,
  font: "Inter",
  size: 0.05,
  weight: 600,
  color: "#000000",
  autoShrink: true
};

const VALUES = {
  learnerName: "Adaeze Okonkwo",
  programmeName: "Programme",
  issuedDate: "18 August 2026",
  certificateId: "abc123"
};

test("xml special characters are escaped", () => {
  assert.equal(escapeXml("Ada & <b>Sons</b>"), "Ada &amp; &lt;b&gt;Sons&lt;/b&gt;");
});

test("a name containing a closing text tag cannot break out of the layer", () => {
  // The one place hostile input reaches a parser. Unescaped, this would
  // terminate the <text> element and let arbitrary SVG in.
  const svg = buildTextLayerSvg(CANVAS, [NAME_FIELD], {
    ...VALUES,
    learnerName: "</text><script>x</script>"
  });
  assert.equal(svg.includes("<script>"), false);
  assert.ok(svg.includes("&lt;/text&gt;"));
});

test("quotes in a name cannot break out of an attribute", () => {
  const svg = buildTextLayerSvg(CANVAS, [NAME_FIELD], {
    ...VALUES,
    learnerName: `Ada" onload="alert(1)`
  });
  assert.equal(svg.includes(`onload="`), false);
});

// Built with String.fromCharCode/fromCodePoint rather than typed as literal
// escapes: keeps the actual control/surrogate code units out of this
// source file (the thing under test is runtime stripping, not the file's
// own bytes) and sidesteps the exact failure mode that has twice put a raw
// invisible byte into a commit in this repo when typed directly.
test("a NUL byte is stripped, not merely escaped", () => {
  // Unescaped/unstripped, this reaches sharp's SVG parser and throws --
  // breaking every certificate for the programme, not just one field.
  const withNul = "Ada" + String.fromCharCode(0) + "Sons";
  assert.equal(escapeXml(withNul), "AdaSons");
});

test("a lone high surrogate is stripped", () => {
  const loneHigh = "Ada" + String.fromCharCode(0xd800) + "Sons";
  assert.equal(escapeXml(loneHigh), "AdaSons");
});

test("a lone low surrogate is stripped", () => {
  const loneLow = "Ada" + String.fromCharCode(0xdc00) + "Sons";
  assert.equal(escapeXml(loneLow), "AdaSons");
});

test("a well-formed astral surrogate pair survives intact", () => {
  // A high surrogate immediately followed by its low half is a legitimate
  // character (an emoji, here) -- only an UNPAIRED half is illegal XML.
  const emoji = String.fromCodePoint(0x1f600);
  const withEmoji = "Ada " + emoji + " Sons";
  assert.equal(escapeXml(withEmoji), withEmoji);
});

test("a tab or newline survives untouched", () => {
  const withWhitespace = "Ada" + String.fromCharCode(9) + "Sons" + String.fromCharCode(10) + "!";
  assert.equal(escapeXml(withWhitespace), withWhitespace);
});

test("text that already fits is never shrunk", () => {
  assert.equal(fitFontSize({ text: "Ada", startPx: 100, maxWidthPx: 400 }), 100);
});

test("a longer string ends up at a smaller size", () => {
  const wide = fitFontSize({ text: "a".repeat(60), startPx: 100, maxWidthPx: 400 });
  assert.ok(wide < 100);
});

test("shrinking stops at the legibility floor rather than vanishing", () => {
  const tiny = fitFontSize({ text: "a".repeat(500), startPx: 100, maxWidthPx: 50 });
  assert.equal(tiny, 24);
});

test("a deliberately small field is never ENLARGED to the floor", () => {
  // A certificate-id line is meant to be 10px. Clamping up to the 24px floor
  // would blow out a field the designer sized on purpose.
  assert.equal(fitFontSize({ text: "abc123", startPx: 10, maxWidthPx: 400 }), 10);
  assert.equal(fitFontSize({ text: "a".repeat(200), startPx: 10, maxWidthPx: 40 }), 10);
});

test("a shrunk size is a whole number, on the conservative side of the box", () => {
  // 12 chars at ratio 0.68 in a 400px box solves to 400 / (12 * 0.68) =
  // 49.0196px (49 * 12 * 0.68 = 399.84, inside; 50 would be 408, outside),
  // well above the 24px floor for a 100px field, so this exercises the
  // fractional mid-range rather than the floor clamp. Rounding UP or keeping
  // the fraction would spend the margin the upper bound exists to provide.
  assert.equal(fitFontSize({ text: "a".repeat(12), startPx: 100, maxWidthPx: 400 }), 49);
});

test("a candidate the division floors a pixel too low is stepped back up", () => {
  // The direct guard for the step-UP half of the float re-check. Which inputs
  // land on such a boundary depends on the ratio, so these were re-derived
  // when it moved from 0.8 to 0.68: 85 / (1 * 0.68) is 124.99999999999999,
  // which floors to 124 -- while 125 multiplies back to exactly 85 and so
  // fits. Without the step-up this returns 124 and silently gives away a
  // pixel of the designer's type size whenever a render lands there.
  assert.equal(fitFontSize({ text: "a", startPx: 150, maxWidthPx: 85 }), 125);
});

test("an empty value keeps its configured size", () => {
  assert.equal(fitFontSize({ text: "", startPx: 48, maxWidthPx: 400 }), 48);
});

test("an image is placed with its aspect ratio preserved", () => {
  const box = placeImage(CANVAS, { x: 0.1, y: 0.2, width: 0.2, align: "left" }, { width: 400, height: 200 });
  assert.equal(box.width, 400);
  assert.equal(box.height, 200);
  assert.equal(box.left, 200);
  assert.equal(box.top, Math.round(0.2 * 1414));
});

test("a centre-aligned image is offset by half its width", () => {
  const box = placeImage(CANVAS, { x: 0.5, y: 0.1, width: 0.2, align: "center" }, { width: 400, height: 200 });
  assert.equal(box.left, 1000 - 200);
});

test("a right-aligned image ends at its anchor", () => {
  const box = placeImage(CANVAS, { x: 0.9, y: 0.1, width: 0.2, align: "right" }, { width: 400, height: 200 });
  assert.equal(box.left, 1800 - 400);
});

test("a tall image keeps its ratio", () => {
  const box = placeImage(CANVAS, { x: 0, y: 0, width: 0.1, align: "left" }, { width: 100, height: 300 });
  assert.equal(box.width, 200);
  assert.equal(box.height, 600);
});

test("placeImage throws rather than dividing by zero on an invalid asset", () => {
  // asset dimensions come from probing an uploaded file -- nothing bounds
  // them the way the canvas dimensions are schema-bounded. A 0-width asset
  // would otherwise produce height: Infinity (0x0 gives NaN), which flows
  // straight into sharp.resize() in the compositing step. Fail loud here,
  // same reasoning as a missing background image: wrong-and-invisible is
  // worse than a render that fails outright.
  assert.throws(() => placeImage(CANVAS, { x: 0.1, y: 0.1, width: 0.2, align: "left" }, { width: 0, height: 200 }));
  assert.throws(() => placeImage(CANVAS, { x: 0.1, y: 0.1, width: 0.2, align: "left" }, { width: 400, height: 0 }));
});

test("every text field appears in the layer", () => {
  const svg = buildTextLayerSvg(
    CANVAS,
    [NAME_FIELD, { ...NAME_FIELD, id: "d", variable: "issuedDate" as const, y: 0.7 }],
    VALUES
  );
  assert.ok(svg.includes("Adaeze Okonkwo"));
  assert.ok(svg.includes("18 August 2026"));
  assert.ok(svg.startsWith("<svg"));
  assert.ok(svg.includes(`width="2000"`));
});

// Mirrors AVG_GLYPH_RATIO/MIN_FONT_PX from layout.ts. Duplicated, not
// imported: this loop IS the specification fitFontSize is checked against,
// so importing the constants it is meant to validate would let a future
// change to those constants silently drag the spec along with the code
// under test, instead of catching the disagreement. Updating this number is
// meant to be a deliberate second act, not a free ride on the first.
const PARAGRAPH_PLAIN =
  "In recognition of your successful completion of the SheTrades Digital " +
  "Learning Programme and your commitment to building practical digital and " +
  "business skills for greater economic opportunity.";

const REFERENCE_AVG_GLYPH_RATIO = 0.68;
const REFERENCE_MIN_FONT_PX = 24;

// The specification, not the optimisation: shrink one pixel at a time,
// using the exact same multiplicative "does it fit" check as fitFontSize's
// own early-return guard, until it fits or the legibility floor is hit.
// fitFontSize's closed-form solve exists purely so this loop doesn't have
// to run on every render; any input where the two disagree is a bug in the
// closed form, not a fact about what "fits" means. This is the loop a spec
// review brute-forced fitFontSize against and found ~10% disagreement in,
// before the epsilon re-check was added -- and the loop that then caught the
// closed form coming up a pixel SHORT when AVG_GLYPH_RATIO was raised to
// 0.8, which is what made that re-check symmetric.
function referenceFitFontSize(text: string, startPx: number, maxWidthPx: number): number {
  const floorPx = Math.min(REFERENCE_MIN_FONT_PX, startPx);
  let size = startPx;
  while (size > floorPx && text.length * size * REFERENCE_AVG_GLYPH_RATIO > maxWidthPx) {
    size -= 1;
  }
  return size;
}

const SAMPLE_TEXT_LENGTHS = [
  0, 1, 2, 3, 5, 7, 10, 13, 17, 20, 25, 30, 40, 50, 60, 75, 90, 110, 130, 160, 200, 250, 300
];
const SAMPLE_START_PX = [8, 10, 12, 16, 20, 24, 28, 32, 40, 48, 60, 72, 90, 100, 120, 150, 180, 200];
const SAMPLE_MAX_WIDTH_PX = [20, 30, 50, 80, 100, 150, 200, 300, 400, 600, 800, 1200];

test("fitFontSize agrees with a naive 1px-decrement reference loop across a sampled grid", () => {
  const mismatches: string[] = [];
  let checked = 0;
  for (const len of SAMPLE_TEXT_LENGTHS) {
    const text = "a".repeat(len);
    for (const startPx of SAMPLE_START_PX) {
      for (const maxWidthPx of SAMPLE_MAX_WIDTH_PX) {
        checked += 1;
        const actual = fitFontSize({ text, startPx, maxWidthPx });
        const expected = referenceFitFontSize(text, startPx, maxWidthPx);
        if (actual !== expected) {
          mismatches.push(`len=${len} startPx=${startPx} maxWidthPx=${maxWidthPx} actual=${actual} expected=${expected}`);
        }
      }
    }
  }
  assert.equal(mismatches.length, 0, `${mismatches.length}/${checked} disagreements:\n${mismatches.slice(0, 10).join("\n")}`);
});

// ---------------------------------------------------------------------------
// Wrapped body paragraph with inline bold
// ---------------------------------------------------------------------------

/** The words a line carries, ignoring where the bold boundaries fell. */
function plain(line: TextSegment[]): string {
  return line.map((segment) => segment.text).join("");
}

const PARAGRAPH =
  "In recognition of your successful completion of the " +
  "**SheTrades Digital Learning Programme** and your commitment to building " +
  "practical digital and business skills for greater economic opportunity.";

const BODY_FIELD = {
  id: "body",
  variable: "bodyText" as const,
  text: PARAGRAPH,
  lineHeight: 1.4,
  maxLines: 4,
  x: 0.5,
  y: 0.6,
  maxWidth: 0.6,
  align: "center" as const,
  font: "DejaVu Sans",
  size: 0.03,
  weight: 400,
  color: "#333333",
  autoShrink: true
};

test("plain text parses as one non-bold segment", () => {
  assert.deepEqual(parseInlineBold("just words"), [{ text: "just words", bold: false }]);
});

test("a bold run becomes its own segment and the markers are consumed", () => {
  assert.deepEqual(parseInlineBold("the **SheTrades** programme"), [
    { text: "the ", bold: false },
    { text: "SheTrades", bold: true },
    { text: " programme", bold: false }
  ]);
});

test("bold at the very start and end of the string is still recognised", () => {
  assert.deepEqual(parseInlineBold("**all of it**"), [{ text: "all of it", bold: true }]);
});

test("an unmatched marker degrades to literal text rather than throwing", () => {
  // Admin-authored config. A typo must produce a slightly ugly certificate,
  // never a render that fails for every learner on the programme.
  assert.deepEqual(parseInlineBold("a **b"), [{ text: "a **b", bold: false }]);
});

test("an empty marker pair degrades to literal text", () => {
  assert.deepEqual(parseInlineBold("a ****b"), [{ text: "a ****b", bold: false }]);
});

test("an empty string parses to no segments at all", () => {
  assert.deepEqual(parseInlineBold(""), []);
});

test("a bold run is measured wider than the same characters unbolded", () => {
  const boldWidth = estimateLineWidthPx([{ text: "aaaa", bold: true }], 100);
  const plainWidth = estimateLineWidthPx([{ text: "aaaa", bold: false }], 100);
  assert.ok(boldWidth > plainWidth, `${boldWidth} should exceed ${plainWidth}`);
  // Pinned, not merely "greater": AVG_GLYPH_RATIO 0.68 times the 1.15 weight
  // multiplier. If either moves, this is where the wrap model's width
  // assumption is meant to be re-argued rather than silently re-derived.
  assert.equal(plainWidth, 4 * 100 * 0.68);
  assert.equal(boldWidth, 4 * 100 * 0.68 * 1.15);
});

test("a paragraph breaks on word boundaries at the width it was given", () => {
  // Deterministic by construction: every word is 4 chars, so at 100px each
  // word estimates to 320px and each space to 80px. Two words (720px) fit an
  // 800px box; three (1120px) do not.
  const lines = wrapRichText({ text: "aaaa ".repeat(6).trim(), maxWidthPx: 800, fontSizePx: 100 });
  assert.equal(lines.length, 3);
  assert.deepEqual(lines.map(plain), ["aaaa aaaa", "aaaa aaaa", "aaaa aaaa"]);
});

test("no line exceeds the box it was wrapped into", () => {
  const lines = wrapRichText({ text: PARAGRAPH, maxWidthPx: 1200, fontSizePx: 42 });
  for (const line of lines) {
    assert.ok(
      estimateLineWidthPx(line, 42) <= 1200,
      `line "${plain(line)}" estimates ${estimateLineWidthPx(line, 42)} in a 1200px box`
    );
  }
});

test("wrapping loses no words and reorders none", () => {
  const lines = wrapRichText({ text: PARAGRAPH, maxWidthPx: 1200, fontSizePx: 42 });
  const rejoined = lines.map(plain).join(" ");
  assert.equal(rejoined, PARAGRAPH.split("**").join(""));
});

test("a word longer than the whole line gets its own line rather than being split", () => {
  // A hyphenated Nigerian surname is one word. Breaking it mid-word would
  // print a name its owner does not have, permanently, on a credential.
  const surname = "Chukwuemeka-Oluwaseun";
  const lines = wrapRichText({ text: `Adaeze ${surname} Okonkwo`, maxWidthPx: 400, fontSizePx: 100 });
  const carriers = lines.map(plain).filter((text) => text.includes("Chukwuemeka"));
  assert.equal(carriers.length, 1);
  assert.equal(carriers[0], surname);
});

test("a bold run that spans a line break stays bold on both lines", () => {
  // The delivered artwork does exactly this: "SheTrades Digital Learning" ends
  // one line and the bold "Programme" opens the next.
  const lines = wrapRichText({ text: "plain **bbbb bbbb** plain", maxWidthPx: 800, fontSizePx: 100 });
  assert.ok(lines.length >= 2);
  const boldPerLine = lines.map((line) => line.filter((segment) => segment.bold).map((segment) => segment.text.trim()));
  assert.deepEqual(boldPerLine.flat().join(" "), "bbbb bbbb");
});

test("text that already fits keeps the size the designer set", () => {
  const fitted = fitWrappedText({ text: "aaaa ".repeat(6).trim(), maxWidthPx: 800, startPx: 100, maxLines: 3 });
  assert.equal(fitted.fontSizePx, 100);
  assert.equal(fitted.lines.length, 3);
});

test("text that needs more lines than the cap is shrunk until it fits the cap", () => {
  // 6 four-char words in an 800px box. Three per line needs
  // (3 * 4 + 2) * 0.68 * size <= 800, i.e. size <= 84.03 -- so 84, and 85
  // must still spill to a third line.
  const fitted = fitWrappedText({ text: "aaaa ".repeat(6).trim(), maxWidthPx: 800, startPx: 100, maxLines: 2 });
  assert.equal(fitted.fontSizePx, 84);
  assert.equal(fitted.lines.length, 2);
});

test("an impossible cap overflows at the legibility floor instead of truncating", () => {
  // Deliberate: a silently truncated sentence reads as a complete but
  // different statement on a credential nobody can check. Overflow is
  // visible; truncation is not.
  const fitted = fitWrappedText({ text: "aaaa ".repeat(6).trim(), maxWidthPx: 200, startPx: 100, maxLines: 1 });
  assert.equal(fitted.fontSizePx, 24);
  assert.ok(fitted.lines.length > 1);
  assert.equal(fitted.lines.map(plain).join(" "), "aaaa ".repeat(6).trim());
});

test("a body field emits one tspan per line inside a single text element", () => {
  const svg = buildTextLayerSvg(CANVAS, [BODY_FIELD], VALUES);
  const lines = fitWrappedText({
    text: PARAGRAPH,
    maxWidthPx: Math.round(0.6 * CANVAS.width),
    startPx: Math.round(0.03 * CANVAS.height),
    maxLines: 4
  });
  assert.equal(svg.split("<tspan").length - 1 >= lines.lines.length, true);
  assert.equal(svg.split("<text ").length - 1, 1);
  // Each line is its own text chunk, anchored at the field's x, which is what
  // keeps centre and right alignment working per line rather than per block.
  assert.equal(svg.split(`<tspan x="1000"`).length - 1, lines.lines.length);
  assert.ok(svg.includes(`text-anchor="middle"`));
});

test("a body field preserves the spaces that separate its tspans", () => {
  // Without xml:space="preserve" an SVG renderer may strip the space at the
  // end of a tspan, running "the" straight into a bold "SheTrades".
  const svg = buildTextLayerSvg(CANVAS, [BODY_FIELD], VALUES);
  assert.ok(svg.includes(`xml:space="preserve"`));
});

test("a bold segment carrying a closing text tag comes out escaped", () => {
  // The bold parser must not open a path where text reaches the XML parser
  // unescaped. Escaping happens per segment, after the split, never before.
  const svg = buildTextLayerSvg(
    CANVAS,
    [{ ...BODY_FIELD, text: "safe **</text><script>alert(1)</script>** words" }],
    VALUES
  );
  assert.equal(svg.includes("<script>"), false);
  assert.ok(svg.includes("&lt;/text&gt;"));
  assert.ok(svg.includes(`font-weight="700"`));
});

test("a single-line field is emitted exactly as before, with no tspans", () => {
  const svg = buildTextLayerSvg(CANVAS, [NAME_FIELD], VALUES);
  assert.equal(svg.includes("<tspan"), false);
  assert.equal(svg.includes("xml:space"), false);
  assert.ok(svg.includes(">Adaeze Okonkwo</text>"));
});

// ---------------------------------------------------------------------------
// Issued-date formatting
// ---------------------------------------------------------------------------

test("long-ordinal renders the date the delivered artwork asks for", () => {
  assert.equal(formatDateValue("2026-08-23", "long-ordinal"), "August 23rd, 2026");
});

test("iso renders the calendar date alone", () => {
  assert.equal(formatDateValue("2026-08-23", "iso"), "2026-08-23");
  assert.equal(formatDateValue("2026-08-23T11:22:33.000Z", "iso"), "2026-08-23");
});

test("the teens take th, which is where naive ordinal code breaks", () => {
  assert.equal(formatDateValue("2026-01-11", "long-ordinal"), "January 11th, 2026");
  assert.equal(formatDateValue("2026-01-12", "long-ordinal"), "January 12th, 2026");
  assert.equal(formatDateValue("2026-01-13", "long-ordinal"), "January 13th, 2026");
});

test("every ordinal suffix in a month is correct", () => {
  const expected = [
    "1st", "2nd", "3rd", "4th", "5th", "6th", "7th", "8th", "9th", "10th",
    "11th", "12th", "13th", "14th", "15th", "16th", "17th", "18th", "19th", "20th",
    "21st", "22nd", "23rd", "24th", "25th", "26th", "27th", "28th", "29th", "30th", "31st"
  ];
  for (let day = 1; day <= 31; day += 1) {
    const iso = `2026-01-${String(day).padStart(2, "0")}`;
    assert.equal(formatDateValue(iso, "long-ordinal"), `January ${expected[day - 1]}, 2026`);
  }
});

test("a date with no configured format is left exactly as it arrived", () => {
  assert.equal(formatDateValue("2026-08-23", undefined), "2026-08-23");
});

test("a value that is not an ISO date passes through rather than rendering Invalid Date", () => {
  // The value is produced by this codebase, not by a learner, so a mismatch
  // here is a bug in our own resolver. Rendering the raw value is still a
  // TRUE date on the credential; failing the render is not recoverable once
  // the learner is waiting for it, and "Invalid Date" would be a lie.
  assert.equal(formatDateValue("18 August 2026", "long-ordinal"), "18 August 2026");
  assert.equal(formatDateValue("2026-13-45", "long-ordinal"), "2026-13-45");
  assert.equal(formatDateValue("", "iso"), "");
});

test("a date field renders through its configured format", () => {
  const svg = buildTextLayerSvg(
    CANVAS,
    [{ ...NAME_FIELD, id: "d", variable: "issuedDate" as const, format: "long-ordinal" as const, y: 0.8 }],
    { ...VALUES, issuedDate: "2026-08-23" }
  );
  assert.ok(svg.includes("August 23rd, 2026"));
});

test("a date field shrinks against its FORMATTED width, not its raw value", () => {
  // "2026-08-23" is 10 characters; "August 23rd, 2026" is 17. Sizing on the
  // raw value would let the long form overhang a box the short form fitted.
  const svg = buildTextLayerSvg(
    CANVAS,
    [
      {
        ...NAME_FIELD,
        id: "d",
        variable: "issuedDate" as const,
        format: "long-ordinal" as const,
        maxWidth: 0.1,
        size: 0.05,
        y: 0.8
      }
    ],
    { ...VALUES, issuedDate: "2026-08-23" }
  );
  const fitted = fitFontSize({ text: "August 23rd, 2026", startPx: Math.round(0.05 * CANVAS.height), maxWidthPx: 200 });
  assert.ok(svg.includes(`font-size="${fitted}"`));
});

test("a per-field glyphRatio overrides the global upper bound when shrinking", () => {
  // The global 0.68 is an upper bound sized for ALL-CAPS names. A field whose
  // content is prose can declare the tighter figure its font actually measures
  // and keep the size the designer chose.
  const wide = fitFontSize({ text: "a".repeat(30), startPx: 100, maxWidthPx: 600 });
  const tight = fitFontSize({ text: "a".repeat(30), startPx: 100, maxWidthPx: 600, glyphRatio: 0.48 });
  assert.ok(tight > wide, "a tighter metric must permit a larger size");
});

test("a per-field glyphRatio overrides the global upper bound when wrapping", () => {
  // The real citation at the real template geometry: the global upper bound
  // breaks it onto four lines, the measured prose figure onto the three the
  // design has. This is the whole reason the override exists.
  const text = PARAGRAPH_PLAIN;
  const wide = wrapRichText({ text, maxWidthPx: 1229, fontSizePx: 33 });
  const tight = wrapRichText({ text, maxWidthPx: 1229, fontSizePx: 33, glyphRatio: 0.48 });
  assert.ok(tight.length < wide.length, "a tighter metric must fit more words per line");
});
