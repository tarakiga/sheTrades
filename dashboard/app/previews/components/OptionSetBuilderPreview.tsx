"use client";

import { useState } from "react";
import { OptionSetBuilder } from "../../../components/config/OptionSetBuilder";
import { ConfigEditorDrawer } from "../../../components/config/ConfigEditorDrawer";
import {
  parseOptionSetDraft,
  serializeOptionSetDraft,
  validateOptionSetDraft
} from "../../../lib/option-set-builder";
import { WHATSAPP_LIMITS } from "../../../lib/whatsapp-constraints";
import { Badge, Button } from "../../../components/ui";

const FIXTURE_PAYLOAD = JSON.stringify({
  title: "Chatbot FAQs",
  // Editor hint contract: fields listed here render with the rich text
  // editor (WhatsApp markdown) instead of a plain textarea.
  fieldHints: { answer: "richtext" },
  items: [
    {
      id: "faq_is_free",
      value: "faq_is_free",
      label: "Is it free?",
      enabled: true,
      sortOrder: 1,
      metadata: {
        question: "Is it free?",
        answer: "Yes! Learning with the SheTrades chatbot is completely free."
      }
    },
    {
      id: "faq_need_data",
      value: "faq_need_data",
      label: "Do I need data?",
      enabled: true,
      sortOrder: 2,
      metadata: {
        question: "Do I need mobile data?",
        answer: "You only need enough data to use WhatsApp. Lessons are text-first and light."
      }
    }
  ]
});

/**
 * Interactive gallery entry for the visual option-set editor used by the
 * settings config drawer (FAQ-shaped fixture). Edits round-trip through the
 * real parse/serialize model; the live JSON output below the builder is
 * exactly what would be stored on Save Draft.
 */
export function OptionSetBuilderPreview() {
  const [draft, setDraft] = useState(() => parseOptionSetDraft(FIXTURE_PAYLOAD));
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerPayload, setDrawerPayload] = useState(() =>
    JSON.stringify(JSON.parse(FIXTURE_PAYLOAD), null, 2)
  );

  if (!draft) return null;
  const error = validateOptionSetDraft(draft);

  return (
    <div className="preview-card-content">
      <div className="preview-row">
        <Button variant="secondary" size="sm" onClick={() => setDrawerOpen(true)}>
          Open in the real settings drawer
        </Button>
      </div>
      <ConfigEditorDrawer
        open={drawerOpen}
        mode="edit"
        namespace="options"
        documentType="option_set"
        namespaceLabel="Options Workspace"
        title="Edit Draft"
        description="Gallery instance of the settings drawer in option-set mode - saving is stubbed."
        keyLabel="Selected Item"
        keyValue="bot.faqs"
        keyPlaceholder="options.bot.example"
        onKeyChange={() => undefined}
        keyReadOnly
        payloadLabel="Draft Details (JSON)"
        payloadValue={drawerPayload}
        payloadPlaceholder=""
        onPayloadChange={setDrawerPayload}
        saving={false}
        primaryActionLabel="Save Draft (stub)"
        onPrimaryAction={() => setDrawerOpen(false)}
        onClose={() => setDrawerOpen(false)}
      />
      <OptionSetBuilder
        draft={draft}
        onChange={setDraft}
        labelLimit={WHATSAPP_LIMITS.listRowTitle}
        maxOptions={WHATSAPP_LIMITS.maxListRows}
      />
      <div className="preview-row">
        {error ? (
          <Badge variant="warning">{error}</Badge>
        ) : (
          <Badge variant="success">Valid - ready to save</Badge>
        )}
      </div>
      <details>
        <summary style={{ cursor: "pointer", fontSize: "var(--font-size-sm)" }}>
          Stored JSON (live)
        </summary>
        <pre
          style={{
            background: "var(--color-neutral-50)",
            border: "1px solid var(--color-neutral-200)",
            borderRadius: "var(--radius-md)",
            fontSize: "var(--font-size-xs)",
            maxHeight: "260px",
            overflow: "auto",
            padding: "var(--space-3)"
          }}
        >
          {serializeOptionSetDraft(draft)}
        </pre>
      </details>
    </div>
  );
}
