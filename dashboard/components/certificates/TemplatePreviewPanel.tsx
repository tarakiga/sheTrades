"use client";

import { Button, Select } from "../ui";
import type { PreviewSample } from "../../lib/admin/certificate-template";

export type TemplatePreviewPanelProps = {
  /** Object URL of the server's render, or null before the first one arrives. */
  previewUrl: string | null;
  loading: boolean;
  error: string;
  samples: PreviewSample[];
  sampleId: string;
  onSampleChange: (sampleId: string) => void;
  onRefresh: () => void;
};

/**
 * The certificate as it will actually be issued.
 *
 * Everything in this panel is drawn by the server, by the same code that draws
 * a real certificate — the canvas next to it only positions boxes. That split
 * is the whole reason this component exists: a browser preview would use the
 * browser's font metrics and wrapping, sharp uses its own, and the two disagree
 * by a few pixels. Signing off the browser version and issuing sharp's would
 * mean every certificate is subtly not the thing anyone approved.
 *
 * The sample selector is here rather than in the layout controls because
 * choosing a learner is a question about THIS image, not about the design.
 */
export function TemplatePreviewPanel({
  previewUrl,
  loading,
  error,
  samples,
  sampleId,
  onSampleChange,
  onRefresh
}: TemplatePreviewPanelProps) {
  return (
    <div className="template-preview">
      <div className="template-preview__controls">
        <Select
          id="preview-sample"
          label="Preview for"
          value={sampleId}
          options={samples.map((sample) => ({
            value: sample.id,
            label: `${sample.label} — ${sample.learnerName}`
          }))}
          emptyMessage="No sample learners available."
          onChange={onSampleChange}
        />
        <Button variant="secondary" onClick={onRefresh} loading={loading}>
          Refresh
        </Button>
      </div>

      {error ? (
        <p className="template-preview__error" role="alert">
          {error}
        </p>
      ) : null}

      <div className="template-preview__frame" aria-busy={loading}>
        {previewUrl ? (
          // A blob URL from an authenticated POST; next/image can neither
          // optimise nor even load it.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            className="template-preview__image"
            src={previewUrl}
            alt="The certificate as it would be issued, rendered by the server"
          />
        ) : (
          <div className="template-preview__placeholder">
            {loading ? "Rendering…" : "No preview yet."}
          </div>
        )}
      </div>

      <p className="template-preview__note">
        Rendered by the server, with the same code that draws a real certificate. The QR points at a
        verification page that does not exist, so scanning it here opens nothing.
      </p>
    </div>
  );
}
