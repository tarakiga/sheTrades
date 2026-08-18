import test from "node:test";
import assert from "node:assert/strict";

import {
  anchorForLeftEdge,
  anchorFromPointer,
  clamp01,
  directionForKey,
  imageHandleRect,
  leftEdgeFor,
  nudgeAnchor,
  roundCoordinate,
  textAnchorYOffset,
  textHandleRect
} from "./geometry.js";

test("alignment maps an anchor to a left edge, and back again", () => {
  // The round trip is the property that matters: a drag computes a left edge
  // and the template stores an anchor, so any disagreement here shows up as a
  // field that shifts sideways every time it is touched.
  for (const align of ["left", "center", "right"] as const) {
    const left = leftEdgeFor(0.5, 0.4, align);
    assert.equal(roundCoordinate(anchorForLeftEdge(left, 0.4, align)), 0.5, align);
  }
});

test("a centred extent starts half its width before its anchor", () => {
  assert.equal(roundCoordinate(leftEdgeFor(0.5, 0.4, "center")), 0.3);
  assert.equal(roundCoordinate(leftEdgeFor(0.5, 0.4, "right")), 0.1);
  assert.equal(roundCoordinate(leftEdgeFor(0.5, 0.4, "left")), 0.5);
});

test("a text handle sits around its baseline, not below it", () => {
  // The renderer draws text ON y. A handle that treated y as the top would sit
  // a whole line below the type it claims to move.
  const rect = textHandleRect({ x: 0.5, y: 0.5, size: 0.06, maxWidth: 0.7, align: "center" });
  assert.ok(rect.top < 0.5, "the box has to start above the baseline");
  assert.ok(rect.top + rect.height > 0.5, "and finish below it");
  assert.equal(rect.width, 0.7);
});

test("a wrapped body field is taller than a single line", () => {
  const one = textHandleRect({ x: 0.5, y: 0.5, size: 0.02, maxWidth: 0.6, align: "center", lines: 1 });
  const three = textHandleRect({
    x: 0.5,
    y: 0.5,
    size: 0.02,
    maxWidth: 0.6,
    align: "center",
    lines: 3,
    lineHeight: 1.4
  });
  assert.ok(three.height > one.height * 2);
});

test("an image handle derives its height from the asset, never from the field", () => {
  // The template has no height for images -- placeImage computes it from the
  // aspect ratio. Inventing one in the editor would let an admin author a
  // stretched logo the renderer cannot reproduce.
  const canvas = { width: 2048, height: 1450 };
  const rect = imageHandleRect(
    { x: 0.1, y: 0.2, width: 0.2, align: "left" },
    canvas,
    { width: 400, height: 200 }
  );
  assert.ok(rect);
  // 0.2 * 2048 = 409.6px wide, half as tall = 204.8px, over a 1450px canvas.
  assert.equal(Math.round(rect.height * 1450), 205);
  assert.equal(rect.left, 0.1);
  assert.equal(rect.top, 0.2);
});

test("an asset with no usable dimensions yields no handle rather than a NaN one", () => {
  const canvas = { width: 2048, height: 1450 };
  assert.equal(imageHandleRect({ x: 0, y: 0, width: 0.2, align: "left" }, canvas, { width: 0, height: 0 }), null);
  assert.equal(
    imageHandleRect({ x: 0, y: 0, width: 0.2, align: "left" }, { width: 0, height: 0 }, { width: 10, height: 10 }),
    null
  );
});

test("dragging a text field returns the baseline, not the box top", () => {
  // Without the offset the field creeps upward a little on every drag -- which
  // does not look like a bug, just like a layout that will not stay put.
  const size = 0.06;
  const bounds = { left: 0, top: 0, width: 1000, height: 700 };
  const anchor = anchorFromPointer({
    pointer: { x: 500, y: 350 },
    bounds,
    // Held in the middle of a 0.7 x 0.1 handle, in canvas fractions.
    grab: { x: 0.35, y: 0.05 },
    size: { width: 0.7, height: 0.1 },
    align: "center",
    anchorYOffset: textAnchorYOffset(size)
  });
  assert.equal(anchor.x, 0.5, "a centred field returns to the anchor it was grabbed at");
  assert.equal(anchor.y, roundCoordinate(0.45 + textAnchorYOffset(size)));
});

test("dragging an image field with no offset lands where the pointer is", () => {
  const anchor = anchorFromPointer({
    pointer: { x: 250, y: 140 },
    bounds: { left: 0, top: 0, width: 1000, height: 700 },
    grab: { x: 0, y: 0 },
    size: { width: 0.1, height: 0.1 },
    align: "left",
    anchorYOffset: 0
  });
  assert.deepEqual(anchor, { x: 0.25, y: 0.2 });
});

test("a drag is measured against the canvas box, not the page", () => {
  const anchor = anchorFromPointer({
    pointer: { x: 300, y: 200 },
    bounds: { left: 100, top: 50, width: 400, height: 300 },
    grab: { x: 0, y: 0 },
    size: { width: 0.1, height: 0.1 },
    align: "left",
    anchorYOffset: 0
  });
  assert.deepEqual(anchor, { x: 0.5, y: 0.5 });
});

test("a zero-sized canvas does not produce NaN coordinates", () => {
  const anchor = anchorFromPointer({
    pointer: { x: 10, y: 10 },
    bounds: { left: 0, top: 0, width: 0, height: 0 },
    grab: { x: 0, y: 0 },
    size: { width: 0.1, height: 0.1 },
    align: "left",
    anchorYOffset: 0
  });
  assert.deepEqual(anchor, { x: 0, y: 0 });
});

test("nudging is fine by default and coarse with shift", () => {
  const start = { x: 0.5, y: 0.5 };
  assert.equal(nudgeAnchor(start, "right", false).x, 0.5005);
  assert.equal(nudgeAnchor(start, "right", true).x, 0.51);
  assert.equal(nudgeAnchor(start, "up", true).y, 0.49);
  assert.equal(nudgeAnchor(start, "down", true).y, 0.51);
});

test("nudging cannot push a field off the canvas", () => {
  // A handle nudged past the edge is unrecoverable by eye, because it is no
  // longer on screen to grab.
  assert.equal(nudgeAnchor({ x: 0, y: 0 }, "left", true).x, 0);
  assert.equal(nudgeAnchor({ x: 1, y: 1 }, "down", true).y, 1);
});

test("only arrow keys nudge", () => {
  assert.equal(directionForKey("ArrowUp"), "up");
  assert.equal(directionForKey("Enter"), null);
  assert.equal(directionForKey("w"), null);
});

test("coordinates round to four places, and non-finite input clamps to zero", () => {
  assert.equal(roundCoordinate(0.123456), 0.1235);
  assert.equal(clamp01(Number.NaN), 0);
  assert.equal(clamp01(-1), 0);
  assert.equal(clamp01(2), 1);
});
