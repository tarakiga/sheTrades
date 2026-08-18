"use client";

import { useState } from "react";
import { FieldInspector } from "../../../components/certificates/FieldInspector";
import { TemplateCanvas } from "../../../components/certificates/TemplateCanvas";
import { TemplatePreviewPanel } from "../../../components/certificates/TemplatePreviewPanel";
import { nudgeAnchor, type NudgeDirection } from "../../../lib/certificates/geometry";
import type {
  CertificateAsset,
  CertificateTemplate,
  TemplateField
} from "../../../lib/admin/certificate-template";

/**
 * The template editor's three pieces, in isolation and with no network.
 *
 * The stub background is an inline SVG data URI rather than real artwork, which
 * suits the workshop: it makes the point that the canvas draws HANDLES over
 * whatever image it is given, and that the certificate itself comes from the
 * preview panel — which here has nothing to show, because nothing rendered it.
 */
const STUB_BACKGROUND =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="725">' +
      '<rect width="1024" height="725" fill="#fdf8ef"/>' +
      '<rect x="24" y="24" width="976" height="677" fill="none" stroke="#e0d3b8" stroke-width="6"/>' +
      "</svg>"
  );

const STUB_ASSETS: CertificateAsset[] = [
  {
    key: "logo-techher-v1",
    kind: "logo",
    mimeType: "image/png",
    width: 480,
    height: 160,
    byteSize: 24_500,
    uploadedBy: "seed",
    uploadedAt: "2026-08-01T00:00:00.000Z"
  }
];

const STUB_TEMPLATE: CertificateTemplate = {
  kind: "certificate_template",
  enabled: false,
  programmeName: "SheTrades Digital Learning Programme",
  issuerName: "TechHer",
  assetKey: "stub-background",
  canvas: { width: 2048, height: 1450 },
  fields: [
    {
      id: "logo-techher",
      variable: "logo",
      assetKey: "logo-techher-v1",
      x: 0.4453,
      y: 0.0469,
      width: 0.1133,
      align: "left",
      opacity: 1
    },
    {
      id: "learner-name",
      variable: "learnerName",
      x: 0.4951,
      y: 0.5269,
      maxWidth: 0.72,
      align: "center",
      font: "Roboto",
      size: 0.0566,
      weight: 700,
      color: "#f2530f",
      autoShrink: true
    },
    {
      id: "citation",
      variable: "bodyText",
      text: "has successfully completed every module of the **SheTrades Digital Learning Programme**.",
      x: 0.5,
      y: 0.62,
      maxWidth: 0.66,
      align: "center",
      font: "Roboto",
      size: 0.024,
      weight: 400,
      color: "#333333",
      autoShrink: true,
      lineHeight: 1.4,
      maxLines: 3,
      glyphRatio: 0.48
    },
    {
      id: "verify-qr",
      variable: "qrCode",
      x: 0.2266,
      y: 0.7083,
      width: 0.0591,
      align: "left",
      opacity: 1
    }
  ]
};

export function CertificateTemplateEditorPreview() {
  const [template, setTemplate] = useState<CertificateTemplate>(STUB_TEMPLATE);
  const [selectedFieldId, setSelectedFieldId] = useState<string | null>("learner-name");

  const selected = template.fields.find((field) => field.id === selectedFieldId) ?? null;

  function updateField(fieldId: string, patch: Partial<TemplateField>) {
    setTemplate((current) => ({
      ...current,
      fields: current.fields.map((field) =>
        field.id === fieldId ? ({ ...field, ...patch } as TemplateField) : field
      )
    }));
  }

  /** Applied inside the updater, exactly as the real editor does it, so held
   * arrow keys accumulate instead of each starting from the same stale
   * position. */
  function nudgeField(fieldId: string, direction: NudgeDirection, coarse: boolean) {
    setTemplate((current) => ({
      ...current,
      fields: current.fields.map((field) =>
        field.id === fieldId
          ? ({ ...field, ...nudgeAnchor({ x: field.x, y: field.y }, direction, coarse) } as TemplateField)
          : field
      )
    }));
  }

  return (
    <div className="template-editor__workspace">
      <TemplateCanvas
        template={template}
        backgroundUrl={STUB_BACKGROUND}
        assetSizes={{ "logo-techher-v1": { width: 480, height: 160 } }}
        selectedFieldId={selectedFieldId}
        onSelect={setSelectedFieldId}
        onMove={(fieldId, anchor) => updateField(fieldId, anchor as Partial<TemplateField>)}
        onNudge={nudgeField}
        onMoveEnd={() => undefined}
      />

      <div>
        <TemplatePreviewPanel
          previewUrl={null}
          loading={false}
          error=""
          samples={[
            { id: "typical", label: "A typical name", learnerName: "Adaeze Okonkwo" },
            {
              id: "long",
              label: "A very long name",
              learnerName: "Oluwafunmilayo Adebayo-Ogundimu-Chukwuemeka Ifeoluwapo"
            }
          ]}
          sampleId="typical"
          onSampleChange={() => undefined}
          onRefresh={() => undefined}
        />

        <FieldInspector
          field={selected}
          assets={STUB_ASSETS}
          onChange={(patch) => {
            if (selectedFieldId) updateField(selectedFieldId, patch);
          }}
          onRemove={() => undefined}
          onCommit={() => undefined}
        />
      </div>
    </div>
  );
}
