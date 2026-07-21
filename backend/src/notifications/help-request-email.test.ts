import test from "node:test";
import assert from "node:assert/strict";
import {
  buildHelpRequestEmail,
  resolveHelpRequestRecipient,
  sendHelpRequestEmail,
  type HelpRequestContext
} from "./help-request-email.js";

const CONTEXT: HelpRequestContext = {
  learnerName: "Jonas Emelda",
  phone: "+2348012345678",
  lessonTitle: "My WhatsApp Business Shop",
  moduleName: "Module 2: Digital Marketing",
  questionText: "Did you run a chat backup or set up a WhatsApp Business tool today?",
  optionChosen: "I need help migrating",
  language: "pcm",
  requestedAt: "2026-07-21T09:15:00.000Z"
};

test("the subject names the learner and the lesson", () => {
  const { subject } = buildHelpRequestEmail(CONTEXT);
  assert.match(subject, /Jonas Emelda/);
  assert.match(subject, /My WhatsApp Business Shop/);
});

test("the body carries every fact the team needs to act", () => {
  const { text } = buildHelpRequestEmail(CONTEXT);
  // Name, number and context — the three things the request is useless without.
  assert.match(text, /Jonas Emelda/);
  assert.match(text, /\+2348012345678/);
  assert.match(text, /Module 2: Digital Marketing/);
  assert.match(text, /My WhatsApp Business Shop/);
  assert.match(text, /Did you run a chat backup/);
  assert.match(text, /I need help migrating/);
});

test("the language code is rendered as a human-readable name", () => {
  // "pcm" means nothing to a support agent reading this on their phone.
  const { text } = buildHelpRequestEmail(CONTEXT);
  assert.match(text, /Nigerian Pidgin/);
  assert.doesNotMatch(text, /Language:\s+pcm/);
});

test("a missing learner name degrades gracefully", () => {
  const { subject, text } = buildHelpRequestEmail({ ...CONTEXT, learnerName: null });
  assert.match(subject, /A learner/);
  assert.match(text, /name not captured/);
  // The phone number is what makes an unnamed request actionable.
  assert.match(text, /\+2348012345678/);
});

test("an unset language does not print a bare null", () => {
  const { text } = buildHelpRequestEmail({ ...CONTEXT, language: null });
  assert.match(text, /Language:\s+not set/);
  assert.doesNotMatch(text, /null/);
});

test("sending is skipped, not failed, when no SMTP integration exists", () => {
  // A fresh deploy with nothing configured must not look like an error.
  return sendHelpRequestEmail(CONTEXT, { loadConfig: () => null }).then((result) => {
    assert.equal(result.status, "skipped");
  });
});

test("sending is skipped when the SMTP integration is disabled", async () => {
  const result = await sendHelpRequestEmail(CONTEXT, {
    loadConfig: () =>
      ({ enabled: false, host: "h", port: 587, secure: false, username: "u", password: "p", fromName: "n", fromEmail: "f@x.com" }) as never
  });
  assert.equal(result.status, "skipped");
});

test("a transport failure is reported, not thrown", async () => {
  // recordAnalytics must never turn a mail outage into a failed webhook.
  const result = await sendHelpRequestEmail(CONTEXT, {
    loadConfig: () =>
      ({ enabled: true, host: "h", port: 587, secure: false, username: "u", password: "p", fromName: "n", fromEmail: "f@x.com" }) as never,
    createTransport: (() => ({
      sendMail: async () => {
        throw new Error("connection refused");
      }
    })) as never
  });
  assert.equal(result.status, "failed");
  assert.match((result as { reason: string }).reason, /connection refused/);
});

test("a successful send addresses the configured recipient and real content", async () => {
  const captured: Array<Record<string, unknown>> = [];
  const result = await sendHelpRequestEmail(CONTEXT, {
    loadConfig: () =>
      ({ enabled: true, host: "h", port: 587, secure: false, username: "u", password: "p", fromName: "SheTrades", fromEmail: "bot@shetrades.digital", replyToEmail: "" }) as never,
    createTransport: (() => ({
      sendMail: async (message: Record<string, unknown>) => {
        captured.push(message);
        return { messageId: "abc123" };
      }
    })) as never
  });

  assert.equal(result.status, "sent");
  const sent = captured[0];
  assert.ok(sent);
  assert.equal(sent.to, "help@shetrades.digital");
  assert.match(String(sent.from), /SheTrades/);
  assert.match(String(sent.subject), /Jonas Emelda/);
  assert.match(String(sent.text), /\+2348012345678/);
});

test("the integration setting wins over the built-in default", () => {
  assert.equal(
    resolveHelpRequestRecipient({ helpRequestRecipient: "ops@example.com" } as never),
    "ops@example.com"
  );
});

test("an unset integration field falls back rather than sending nowhere", () => {
  // A blank field must not mean "drop the request" — it means "use the default".
  assert.equal(
    resolveHelpRequestRecipient({ helpRequestRecipient: "" } as never),
    "help@shetrades.digital"
  );
  assert.equal(resolveHelpRequestRecipient(null), "help@shetrades.digital");
  assert.equal(resolveHelpRequestRecipient(), "help@shetrades.digital");
});

test("the configured recipient is actually the address mail is sent to", () => {
  const captured: Array<Record<string, unknown>> = [];
  return sendHelpRequestEmail(CONTEXT, {
    loadConfig: () =>
      ({
        enabled: true, host: "h", port: 465, secure: true, username: "u", password: "p",
        fromName: "SheTrades", fromEmail: "bot@x.com", helpRequestRecipient: "team@example.com"
      }) as never,
    createTransport: (() => ({
      sendMail: async (m: Record<string, unknown>) => { captured.push(m); return { messageId: "1" }; }
    })) as never
  }).then((result) => {
    assert.equal(result.status, "sent");
    assert.equal(captured[0]?.to, "team@example.com");
  });
});
