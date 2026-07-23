"use client";

import { useState } from "react";
import {
  BrandingEditor,
  type BrandingFormState
} from "../../../components/branding/BrandingWorkspace";

const INITIAL_FORM: BrandingFormState = {
  organisationName: "SheTrades",
  primaryColor: "#206757",
  secondaryColor: "#de581c",
  accentColor: "#ff8000",
  fontFamily: "Asap"
};

const DEFAULT_FORM: BrandingFormState = {
  organisationName: "SheTrades",
  primaryColor: "#334e58",
  secondaryColor: "#ffbe22",
  accentColor: "#f0a90e",
  fontFamily: "Asap"
};

/**
 * Network-free harness for the branding editor: local state simulates
 * change/reset/publish, and the live preview panel re-themes as you edit -
 * the same presentational component the real Settings → Branding tab renders.
 */
export function BrandingEditorPreview() {
  const [form, setForm] = useState<BrandingFormState>(INITIAL_FORM);
  const [publishing, setPublishing] = useState(false);

  return (
    <div className="preview-card-content">
      <BrandingEditor
        form={form}
        errors={{}}
        onChange={setForm}
        onReset={() => setForm(DEFAULT_FORM)}
        onPublish={() => {
          setPublishing(true);
          window.setTimeout(() => setPublishing(false), 600);
        }}
        publishing={publishing}
      />
    </div>
  );
}
