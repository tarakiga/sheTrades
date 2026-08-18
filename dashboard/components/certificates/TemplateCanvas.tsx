"use client";

import { useCallback, useRef, useState } from "react";
import {
  anchorFromPointer,
  clamp01,
  directionForKey,
  imageHandleRect,
  percent,
  textAnchorYOffset,
  textHandleRect,
  type FractionRect,
  type NudgeDirection
} from "../../lib/certificates/geometry";
import {
  VARIABLE_LABELS,
  isImageField,
  type CertificateTemplate,
  type TemplateField
} from "../../lib/admin/certificate-template";

export type TemplateCanvasProps = {
  template: CertificateTemplate;
  /** Object URL for the background artwork, or null while it loads. */
  backgroundUrl: string | null;
  /** True pixel dimensions per asset key, so logo handles can keep the aspect
   * ratio the renderer will keep. */
  assetSizes: Record<string, { width: number; height: number }>;
  selectedFieldId: string | null;
  onSelect: (fieldId: string) => void;
  onMove: (fieldId: string, anchor: { x: number; y: number }) => void;
  /**
   * A keyboard nudge, passed as a DIRECTION rather than as a computed anchor.
   *
   * The difference matters. A drag is driven by pointer positions, which are
   * absolute, so it can hand over coordinates. A nudge is relative to wherever
   * the field currently is — and if this component computed that from its own
   * props, two key presses arriving in the same React tick (key repeat on a
   * busy machine) would both read the same starting point and the second would
   * silently undo the first. Handing over the direction lets the parent apply
   * it inside a functional state update, where the current position is the one
   * it actually sees.
   */
  onNudge: (fieldId: string, direction: NudgeDirection, coarse: boolean) => void;
  /** Fired when a move FINISHES — on pointer-up or key-up, not on every frame.
   * The page uses it to re-render the server preview, which is far too
   * expensive to run mid-drag. */
  onMoveEnd: () => void;
};

/**
 * The drag surface.
 *
 * What this draws are HANDLES, not a preview. Each box shows where a field is
 * anchored and how much room it is allowed (its `maxWidth`), and the actual
 * type is drawn by the server and shown alongside. Conflating the two is the
 * trap the spec calls out: an HTML approximation of sharp's text layout would
 * disagree by a few pixels, the browser version is what gets signed off, and
 * every issued certificate would then be subtly not the thing anyone approved.
 *
 * So the boxes are deliberately styled as instruments — dashed outlines and
 * labels — rather than as the certificate.
 */
export function TemplateCanvas({
  template,
  backgroundUrl,
  assetSizes,
  selectedFieldId,
  onSelect,
  onMove,
  onNudge,
  onMoveEnd
}: TemplateCanvasProps) {
  const stageRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<{ fieldId: string; grabX: number; grabY: number } | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);

  const rectFor = useCallback(
    (field: TemplateField): FractionRect | null => {
      if (isImageField(field)) {
        const asset = field.assetKey ? assetSizes[field.assetKey] : undefined;
        // A QR has no stored asset — it is generated at render time — and it is
        // always square, so that is the aspect to draw it at.
        const natural = asset ?? (field.variable === "qrCode" ? { width: 1, height: 1 } : null);
        if (!natural) return null;
        return imageHandleRect(field, template.canvas, natural);
      }
      return textHandleRect({
        x: field.x,
        y: field.y,
        size: field.size,
        maxWidth: field.maxWidth,
        align: field.align,
        ...(field.variable === "bodyText"
          ? { lines: field.maxLines, lineHeight: field.lineHeight }
          : {})
      });
    },
    [assetSizes, template.canvas]
  );

  function beginDrag(field: TemplateField, event: React.PointerEvent<HTMLButtonElement>) {
    const stage = stageRef.current;
    const rect = rectFor(field);
    if (!stage || !rect) return;
    const bounds = stage.getBoundingClientRect();
    if (!(bounds.width > 0) || !(bounds.height > 0)) return;

    // Where inside the handle the pointer took hold, in canvas fractions, so
    // the field does not jump to centre itself under the cursor.
    dragRef.current = {
      fieldId: field.id,
      grabX: (event.clientX - bounds.left) / bounds.width - rect.left,
      grabY: (event.clientY - bounds.top) / bounds.height - rect.top
    };
    setDragging(field.id);
    onSelect(field.id);
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function continueDrag(field: TemplateField, event: React.PointerEvent<HTMLButtonElement>) {
    const drag = dragRef.current;
    const stage = stageRef.current;
    const rect = rectFor(field);
    if (!drag || drag.fieldId !== field.id || !stage || !rect) return;
    const bounds = stage.getBoundingClientRect();
    onMove(
      field.id,
      anchorFromPointer({
        pointer: { x: event.clientX, y: event.clientY },
        bounds: {
          left: bounds.left,
          top: bounds.top,
          width: bounds.width,
          height: bounds.height
        },
        grab: { x: drag.grabX, y: drag.grabY },
        size: { width: rect.width, height: rect.height },
        align: field.align,
        anchorYOffset: isImageField(field) ? 0 : textAnchorYOffset(field.size)
      })
    );
  }

  function endDrag(event: React.PointerEvent<HTMLButtonElement>) {
    if (!dragRef.current) return;
    dragRef.current = null;
    setDragging(null);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    onMoveEnd();
  }

  function handleKeyDown(field: TemplateField, event: React.KeyboardEvent<HTMLButtonElement>) {
    const direction = directionForKey(event.key);
    if (!direction) return;
    // Arrow keys scroll the page by default, which would move the canvas out
    // from under the field being nudged.
    event.preventDefault();
    onNudge(field.id, direction, event.shiftKey);
  }

  return (
    <div className="certificate-canvas">
      <div
        className="certificate-canvas__stage"
        ref={stageRef}
        style={{ aspectRatio: `${template.canvas.width} / ${template.canvas.height}` }}
      >
        {backgroundUrl ? (
          // A blob URL from an authenticated fetch; next/image can neither
          // optimise nor even load it.
          // eslint-disable-next-line @next/next/no-img-element
          <img className="certificate-canvas__background" src={backgroundUrl} alt="" />
        ) : (
          <div className="certificate-canvas__background-placeholder">
            <span>Loading artwork…</span>
          </div>
        )}

        {template.fields.map((field) => {
          const rect = rectFor(field);
          if (!rect) return null;
          const selected = field.id === selectedFieldId;
          const isImage = isImageField(field);
          return (
            <button
              key={field.id}
              type="button"
              className={[
                "certificate-canvas__handle",
                isImage ? "certificate-canvas__handle--image" : "certificate-canvas__handle--text",
                selected ? "is-selected" : "",
                dragging === field.id ? "is-dragging" : ""
              ]
                .filter(Boolean)
                .join(" ")}
              style={{
                left: percent(rect.left),
                top: percent(clamp01(rect.top)),
                width: percent(rect.width),
                height: percent(rect.height)
              }}
              aria-pressed={selected}
              aria-label={`${VARIABLE_LABELS[field.variable]}. Drag to move, or use the arrow keys.`}
              onPointerDown={(event) => beginDrag(field, event)}
              onPointerMove={(event) => continueDrag(field, event)}
              onPointerUp={endDrag}
              onPointerCancel={endDrag}
              onKeyDown={(event) => handleKeyDown(field, event)}
              onKeyUp={(event) => {
                if (directionForKey(event.key)) onMoveEnd();
              }}
              onFocus={() => onSelect(field.id)}
            >
              <span className="certificate-canvas__handle-label">
                {VARIABLE_LABELS[field.variable]}
              </span>
              {isImage ? null : (
                // The baseline the renderer will actually sit the type on.
                // Without it the box looks like it contains the text, and a
                // field nudged to "look centred" would be a line out.
                <span className="certificate-canvas__baseline" aria-hidden="true" />
              )}
            </button>
          );
        })}
      </div>

      <p className="certificate-canvas__hint">
        These boxes show where each field is anchored and how much width it may use. They are not
        the certificate: the preview beside them is the real render.
      </p>
    </div>
  );
}
