"use client";

import { useState } from "react";
import { RichTextEditor, Textarea } from "../../../components/ui";

/**
 * GAP-H4: RichTextEditor and Textarea are stateful (controlled) components, so
 * the preview needs a small client wrapper to hold their value - the previews
 * page itself is a server component.
 */
export function PreviewEditorsDemo() {
  const [rich, setRich] = useState(
    "Keep a *daily* record of what you sell.\n\nIt takes _two minutes_ and shows your real profit."
  );
  const [note, setNote] = useState("");

  return (
    <div style={{ display: "grid", gap: "var(--space-5)" }}>
      <RichTextEditor
        id="preview-rich-text"
        label="Rich Text Editor - WhatsApp formatting"
        value={rich}
        onChange={setRich}
        placeholder="Write lesson copy here..."
      />

      <Textarea
        id="preview-textarea-default"
        label="Textarea - with hint"
        hint="Plain multi-line input used for raw JSON payloads and notes."
        rows={3}
        value={note}
        onChange={(event) => setNote(event.target.value)}
        placeholder="Add an internal note..."
      />

      <Textarea
        id="preview-textarea-error"
        label="Textarea - error state"
        error="This field is required before publishing."
        rows={2}
        defaultValue=""
        placeholder="Required field"
      />
    </div>
  );
}
