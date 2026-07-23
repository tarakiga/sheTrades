"use client";

import { useEffect, useState } from "react";
import { Badge, Button, Select, SideDrawer, Textarea } from "../ui";
import {
  getLearnerMessages,
  sendLearnerMessage,
  type OutboundMessageRow
} from "../../lib/admin/api";
import { fetchPublicOptionSet } from "../../lib/config/options";

const TEXT_MAX = 1024;

export type ContactLearnerDrawerProps = {
  phone: string | null;
  name: string;
  open: boolean;
  onClose: () => void;
};

type TemplateOption = { value: string; label: string; description: string };

type Feedback = { tone: "success" | "danger" | "warning"; text: string };

/**
 * Operator → learner WhatsApp outreach. Two modes:
 *  - Template: a pre-approved Meta template (config-driven via the
 *    whatsapp.outreach_templates option set) - deliverable at any time.
 *  - Free text: only deliverable inside WhatsApp's 24-hour customer-service
 *    window; the backend enforces the rule and this drawer surfaces its answer.
 * Every send (success or failure) is audit-logged; recent history shows below.
 */
export function ContactLearnerDrawer({ phone, name, open, onClose }: ContactLearnerDrawerProps) {
  const [mode, setMode] = useState<"template" | "text">("template");
  const [templates, setTemplates] = useState<TemplateOption[]>([]);
  const [templateKey, setTemplateKey] = useState("");
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [history, setHistory] = useState<OutboundMessageRow[]>([]);

  useEffect(() => {
    if (!open || !phone) return;
    let cancelled = false;
    setFeedback(null);
    setText("");
    fetchPublicOptionSet("whatsapp.outreach_templates")
      .then((items) => {
        if (cancelled) return;
        const options = items.map((item) => ({
          value: item.value,
          label: item.label,
          description:
            typeof item.metadata.description === "string" ? item.metadata.description : ""
        }));
        setTemplates(options);
        setTemplateKey((current) => current || (options[0]?.value ?? ""));
      })
      .catch(() => {
        if (!cancelled) setTemplates([]);
      });
    void getLearnerMessages(phone).then((result) => {
      if (!cancelled) setHistory(result.data.messages);
    });
    return () => {
      cancelled = true;
    };
  }, [open, phone]);

  async function handleSend() {
    if (!phone) return;
    setSending(true);
    setFeedback(null);
    try {
      await sendLearnerMessage(
        phone,
        mode === "template" ? { templateKey } : { text: text.trim() }
      );
      setFeedback({ tone: "success", text: "Message sent." });
      setText("");
      const refreshed = await getLearnerMessages(phone);
      setHistory(refreshed.data.messages);
    } catch (error) {
      setFeedback({
        tone: "danger",
        text: error instanceof Error ? error.message : "Send failed."
      });
    } finally {
      setSending(false);
    }
  }

  const sendDisabled =
    sending || (mode === "template" ? !templateKey : text.trim().length === 0);

  return (
    <SideDrawer
      open={open}
      title={`Message ${name || phone || "learner"}`}
      description="Sends a WhatsApp message from the programme number. Free text only delivers if the learner messaged within the last 24 hours; templates deliver any time."
      onClose={onClose}
      footerActions={
        <>
          <Button variant="secondary" onClick={onClose}>
            Close
          </Button>
          <Button loading={sending} disabled={sendDisabled} onClick={() => void handleSend()}>
            Send Message
          </Button>
        </>
      }
    >
      <div className="contact-learner">
        {feedback ? (
          <div className="contact-learner__feedback">
            <Badge variant={feedback.tone}>{feedback.text}</Badge>
          </div>
        ) : null}

        <div className="wizard-mode-toggle" role="group" aria-label="Message type">
          <button
            type="button"
            className={`wizard-mode-toggle__btn ${mode === "template" ? "wizard-mode-toggle__btn--active" : ""}`}
            aria-pressed={mode === "template"}
            onClick={() => setMode("template")}
          >
            Approved Template
          </button>
          <button
            type="button"
            className={`wizard-mode-toggle__btn ${mode === "text" ? "wizard-mode-toggle__btn--active" : ""}`}
            aria-pressed={mode === "text"}
            onClick={() => setMode("text")}
          >
            Free Text
          </button>
        </div>

        {mode === "template" ? (
          templates.length > 0 ? (
            <>
              <Select
                id="contact-learner-template"
                label="Template"
                value={templateKey}
                options={templates.map(({ value, label }) => ({ value, label }))}
                onChange={setTemplateKey}
                hint="Managed under Settings → Options → whatsapp.outreach_templates. The value must match an approved template name in Meta Business Manager."
              />
              {templates.find((t) => t.value === templateKey)?.description ? (
                <p className="contact-learner__template-note">
                  {templates.find((t) => t.value === templateKey)?.description}
                </p>
              ) : null}
            </>
          ) : (
            <p className="contact-learner__template-note">
              No outreach templates are published yet. Add them under Settings → Options
              (whatsapp.outreach_templates), or use free text while the learner is inside the
              24-hour window.
            </p>
          )
        ) : (
          <Textarea
            id="contact-learner-text"
            label="Message"
            rows={5}
            value={text}
            maxLength={TEXT_MAX}
            onChange={(event) => setText(event.target.value)}
            hint={`${text.length}/${TEXT_MAX} characters. Delivers only if the learner messaged within the last 24 hours - otherwise choose a template.`}
          />
        )}

        <div className="contact-learner__history">
          <p className="contact-learner__history-label">Recent outreach</p>
          {history.length === 0 ? (
            <p className="contact-learner__template-note">No messages sent to this learner yet.</p>
          ) : (
            <ul className="contact-learner__history-list">
              {history.map((row) => (
                <li key={row.id} className="contact-learner__history-item">
                  <div className="contact-learner__history-meta">
                    <Badge variant={row.status === "sent" ? "success" : "danger"}>
                      {row.status === "sent" ? "Sent" : "Failed"}
                    </Badge>
                    <span className="contact-learner__history-date">
                      {new Date(row.createdAt).toLocaleString()}
                    </span>
                  </div>
                  <p className="contact-learner__history-body">
                    {row.kind === "template" ? `Template: ${row.body}` : row.body}
                  </p>
                  {row.status !== "sent" && row.detail ? (
                    <p className="contact-learner__history-error">{row.detail}</p>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </SideDrawer>
  );
}
