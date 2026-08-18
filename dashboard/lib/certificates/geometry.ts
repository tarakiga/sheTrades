/**
 * The arithmetic behind the template canvas.
 *
 * Pure, and separated from the components on purpose: this is the code that has
 * to AGREE WITH THE RENDERER. A box drawn a few percent away from where sharp
 * will actually place the thing produces an editor that looks right and lies,
 * and the lie only surfaces on a learner's certificate. So the maths lives
 * somewhere it can be read next to `layout.ts` and tested without a browser.
 *
 * Everything here works in FRACTIONS of the canvas, never pixels, because that
 * is what the template stores and why — a layout authored against an 800px
 * preview has to render identically at 2048px. Converting to pixels for display
 * happens once, at the edge, in the component.
 *
 * The boxes this produces are handles, not previews. The real preview is the
 * server's render; see TemplatePreviewPanel.
 */

export type Canvas = { width: number; height: number };
export type Align = "left" | "center" | "right";

/** A rectangle in canvas fractions: 0..1 on both axes, origin top-left. */
export type FractionRect = { left: number; top: number; width: number; height: number };

/**
 * How far an arrow key moves a field.
 *
 * Fine is roughly one pixel on a 2048px canvas, which is what "nudge" has to
 * mean if it is going to be useful for the last adjustment. Coarse is what an
 * impatient hand wants when the field is on the wrong half of the page.
 */
export const NUDGE_FINE = 0.0005;
export const NUDGE_COARSE = 0.01;

/**
 * Four decimals: sub-pixel at 2048px (1/2048 is 0.00049), and it keeps the
 * stored payload readable by whoever has to diff two versions of it.
 */
export function roundCoordinate(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}

export function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

/** Where a horizontal extent starts, given its anchor and how it is aligned.
 * Mirrors both `placeImage` and the SVG text-anchor mapping in layout.ts. */
export function leftEdgeFor(anchorX: number, width: number, align: Align): number {
  if (align === "center") return anchorX - width / 2;
  if (align === "right") return anchorX - width;
  return anchorX;
}

/** The inverse: the anchor that would put an extent's left edge here. Used
 * while dragging, because a drag moves the BOX and the template stores the
 * ANCHOR. */
export function anchorForLeftEdge(left: number, width: number, align: Align): number {
  if (align === "center") return left + width / 2;
  if (align === "right") return left + width;
  return left;
}

/**
 * Rough vertical extent of a line of type, as a multiple of its font size.
 *
 * The renderer draws text on a BASELINE — `y` in a text field is where the
 * letters sit, not the top of the box — so a handle that treated `y` as the top
 * would sit a whole line below the type it claims to move. These two constants
 * put the handle around the glyphs instead. They are approximate by nature, and
 * that is acceptable precisely because the handle is not the preview.
 */
const ASCENT_RATIO = 0.82;
const DESCENT_RATIO = 0.22;

/**
 * How far a text handle's TOP sits above its stored `y`.
 *
 * Exported because dragging has to undo it. A drag knows where the box now is;
 * the template stores where the baseline is, and the two differ by most of a
 * line. Getting this wrong does not look like a bug — the field simply creeps
 * upward a little every time anyone touches it.
 */
export function textAnchorYOffset(size: number): number {
  return size * ASCENT_RATIO;
}

/**
 * The handle for a text field, in canvas fractions.
 *
 * `size` is a fraction of canvas HEIGHT and `maxWidth` a fraction of canvas
 * WIDTH — they are not interchangeable, and mixing them up is the mistake this
 * function exists to make impossible to repeat.
 */
export function textHandleRect(field: {
  x: number;
  y: number;
  size: number;
  maxWidth: number;
  align: Align;
  lines?: number;
  lineHeight?: number;
}): FractionRect {
  const lines = Math.max(1, field.lines ?? 1);
  const lineHeight = field.lineHeight ?? 1;
  const blockHeight = field.size * (ASCENT_RATIO + DESCENT_RATIO + (lines - 1) * lineHeight);
  return {
    left: leftEdgeFor(field.x, field.maxWidth, field.align),
    top: field.y - field.size * ASCENT_RATIO,
    width: field.maxWidth,
    height: blockHeight
  };
}

/**
 * The handle for an image field, in canvas fractions.
 *
 * Height is DERIVED from the asset's aspect ratio, exactly as `placeImage`
 * derives it, so a logo cannot be stretched by dragging: the template has no
 * height field for images, and inventing one in the editor would let an admin
 * author something the renderer cannot reproduce.
 *
 * Returns null for an asset with no usable dimensions rather than dividing by
 * zero — the renderer throws in that case, and the editor should show nothing
 * rather than a NaN-positioned box.
 */
export function imageHandleRect(
  field: { x: number; y: number; width: number; align: Align },
  canvas: Canvas,
  asset: { width: number; height: number }
): FractionRect | null {
  if (!(asset.width > 0) || !(asset.height > 0)) return null;
  if (!(canvas.width > 0) || !(canvas.height > 0)) return null;
  const widthPx = field.width * canvas.width;
  const heightPx = (widthPx * asset.height) / asset.width;
  return {
    left: leftEdgeFor(field.x, field.width, field.align),
    top: field.y,
    width: field.width,
    height: heightPx / canvas.height
  };
}

export type NudgeDirection = "up" | "down" | "left" | "right";

/** Maps an arrow key to a direction, or null for anything else. */
export function directionForKey(key: string): NudgeDirection | null {
  switch (key) {
    case "ArrowUp":
      return "up";
    case "ArrowDown":
      return "down";
    case "ArrowLeft":
      return "left";
    case "ArrowRight":
      return "right";
    default:
      return null;
  }
}

/**
 * Moves an anchor by one nudge.
 *
 * Clamped to the canvas: a field dragged or nudged off the edge is not
 * recoverable by eye, because its handle is no longer on screen to grab.
 */
export function nudgeAnchor(
  anchor: { x: number; y: number },
  direction: NudgeDirection,
  coarse: boolean
): { x: number; y: number } {
  const step = coarse ? NUDGE_COARSE : NUDGE_FINE;
  const dx = direction === "left" ? -step : direction === "right" ? step : 0;
  const dy = direction === "up" ? -step : direction === "down" ? step : 0;
  return {
    x: roundCoordinate(clamp01(anchor.x + dx)),
    y: roundCoordinate(clamp01(anchor.y + dy))
  };
}

/**
 * Turns a pointer position inside the rendered canvas into an anchor.
 *
 * `grab` is the pointer's offset from the handle's top-left corner, expressed
 * in CANVAS fractions rather than as a fraction of the handle itself — the same
 * unit as everything else here, so the subtraction below needs no conversion.
 * It exists so the field does not jump to centre itself under the cursor on the
 * first pixel of movement.
 *
 * `anchorYOffset` is how far the handle's top sits above the stored `y` — zero
 * for an image, most of a line for text. Passing it is what stops a text field
 * creeping up the page every time it is dragged.
 */
export function anchorFromPointer(input: {
  pointer: { x: number; y: number };
  bounds: { left: number; top: number; width: number; height: number };
  grab: { x: number; y: number };
  size: { width: number; height: number };
  align: Align;
  anchorYOffset: number;
}): { x: number; y: number } {
  if (!(input.bounds.width > 0) || !(input.bounds.height > 0)) return { x: 0, y: 0 };
  const fx = (input.pointer.x - input.bounds.left) / input.bounds.width;
  const fy = (input.pointer.y - input.bounds.top) / input.bounds.height;
  const left = fx - input.grab.x;
  const top = fy - input.grab.y;
  return {
    x: roundCoordinate(clamp01(anchorForLeftEdge(left, input.size.width, input.align))),
    y: roundCoordinate(clamp01(top + input.anchorYOffset))
  };
}

/** CSS percentage for a fraction. Clamped nowhere on purpose: a handle that has
 * drifted outside the canvas should be VISIBLY outside it, not silently pinned
 * to the edge where it looks correct. */
export function percent(fraction: number): string {
  return `${(fraction * 100).toFixed(3)}%`;
}
