import test from "node:test";
import assert from "node:assert/strict";
import { buildTextLayerSvg, escapeXml, fitFontSize, placeImage } from "./layout.js";

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
  // 12 chars at ratio 0.8 in a 400px box solves to 400 / (12 * 0.8) = 41.6667px,
  // well above the 24px floor for a 100px field, so this exercises the
  // fractional mid-range rather than the floor clamp. Rounding UP or keeping
  // the fraction would put the text on the box edge, spending the margin the
  // upper-bound ratio exists to provide.
  assert.equal(fitFontSize({ text: "a".repeat(12), startPx: 100, maxWidthPx: 400 }), 41);
});

test("a candidate the division floors a pixel too low is stepped back up", () => {
  // The direct guard for the step-UP half of the float re-check. 3 chars in a
  // 300px box: (3 * 0.8) is 2.4000000000000004, so 300 / that is
  // 124.99999999999999 and floors to 124 -- while 125 multiplies back to
  // exactly 300 and therefore fits. Without the step-up this returns 124 and
  // silently gives away a pixel of the designer's type size on every render
  // that lands on such a boundary.
  assert.equal(fitFontSize({ text: "a".repeat(3), startPx: 150, maxWidthPx: 300 }), 125);
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
const REFERENCE_AVG_GLYPH_RATIO = 0.8;
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
