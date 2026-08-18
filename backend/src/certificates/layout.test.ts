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
  // 20 chars at ratio 0.55 in a 400px box solves to 400 / (20 * 0.55) = 36.3636px,
  // above the 24px floor for a 100px field, so this exercises the fractional
  // mid-range rather than the floor clamp. Rounding UP or keeping the
  // fraction would put the text on the box edge, spending the margin the
  // pessimistic ratio exists to provide.
  assert.equal(fitFontSize({ text: "a".repeat(20), startPx: 100, maxWidthPx: 400 }), 36);
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
