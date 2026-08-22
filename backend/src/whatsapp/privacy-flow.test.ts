import test from "node:test";
import assert from "node:assert/strict";
import { transition, type CertificateDeps } from "./handler.js";
import { BOT_PROMPT_DEFAULTS } from "./bot-prompts.js";
import { WHATSAPP_LIMITS } from "./constraints.js";

/**
 * The privacy gate, driven turn by turn.
 *
 * The value of this feature is in the SEQUENCE, not in any single branch: that
 * an unclear answer does not advance, that a failed write does not let her
 * through, that nothing is asked before she has agreed. Each of those is a
 * property of two turns in a row.
 */

type Session = Parameters<typeof transition>[0];

function session(overrides: Record<string, unknown> = {}): Session {
  return {
    phone: "2348000000001",
    userId: "user-1",
    state: "awaiting_language",
    completedLessons: [],
    lastUpdatedAt: new Date().toISOString(),
    _events: [],
    ...overrides
  } as unknown as Session;
}

function deps(overrides: Partial<CertificateDeps> = {}) {
  const consents: Array<{ decision: string; noticeVersion: number; language: string }> = [];
  const erasures: string[] = [];
  const base: CertificateDeps = {
    lessons: () => [],
    template: () => null,
    templateVersion: () => 1,
    baseUrl: () => "https://example.test",
    findCertificate: async () => null,
    issue: async () => ({ status: "failed", reason: "not used" }),
    resend: async () => true,
    noticeVersion: () => 7,
    recordConsent: async (input) => {
      consents.push({
        decision: input.decision,
        noticeVersion: input.noticeVersion,
        language: input.language
      });
      return true;
    },
    erase: async (input) => {
      erasures.push(input.phone);
      return { status: "erased", requestRef: "AB12-CD34" };
    },
    ...overrides
  };
  return { deps: base, consents, erasures };
}

// --- the gate ---------------------------------------------------------------

test("first contact asks for a language, not a name", () => {
  // Language has to come first because she must be able to READ the notice
  // before she is asked to agree to it.
  const s = session();
  assert.equal(s.state, "awaiting_language");
});

test("an opening hello is answered with the language question", async () => {
  const s = session();
  const { deps: d } = deps();
  const reply = await transition(s, "hi", d);
  assert.equal(reply.state, "awaiting_language");
  assert.ok((reply.buttons?.length ?? 0) > 0, "the language choices should be offered");
  assert.doesNotMatch(reply.reply, /name/i, "there is no name yet to greet her by");
});

test("choosing a language shows the notice, and asks for nothing else", async () => {
  const s = session();
  const { deps: d } = deps();
  const reply = await transition(s, "English", d);

  assert.equal(reply.state, "awaiting_privacy_consent");
  assert.match(reply.reply, /privacy/i);
  assert.deepEqual(reply.buttons, ["CONTINUE", "EXIT"]);
  // Nothing about her has been asked for yet. That is what makes EXIT clean.
  assert.doesNotMatch(reply.reply, /your full name/i);
});

test("continuing records the consent with the version she was shown", async () => {
  const s = session({ state: "awaiting_privacy_consent", language: "en" });
  const { deps: d, consents } = deps();
  const reply = await transition(s, "CONTINUE", d);

  assert.deepEqual(consents, [{ decision: "accepted", noticeVersion: 7, language: "en" }]);
  assert.equal(reply.state, "awaiting_name");
});

test("exiting records the decline and does not move her on", async () => {
  const s = session({ state: "awaiting_privacy_consent", language: "en" });
  const { deps: d, consents } = deps();
  const reply = await transition(s, "EXIT", d);

  assert.equal(consents[0]?.decision, "declined");
  assert.equal(reply.state, "awaiting_privacy_consent");
  assert.doesNotMatch(reply.reply, /your full name/i);
});

test("declining is not a dead end", async () => {
  // Consent that cannot be reconsidered is weaker than consent that can, and
  // at this point the only thing held about her is her number and language.
  const s = session({ state: "awaiting_privacy_consent", language: "en" });
  const { deps: d } = deps();
  await transition(s, "EXIT", d);
  const second = await transition(s, "hello again", d);
  assert.equal(second.state, "awaiting_privacy_consent");
  assert.match(second.reply, /privacy/i, "writing back shows the notice again");
});

test("an unclear answer is not consent", async () => {
  const s = session({ state: "awaiting_privacy_consent", language: "en" });
  const { deps: d, consents } = deps();
  const reply = await transition(s, "what is this", d);

  assert.equal(reply.state, "awaiting_privacy_consent");
  assert.equal(consents.length, 0, "nothing should be recorded for an answer we could not read");
  assert.deepEqual(reply.buttons, ["CONTINUE", "EXIT"]);
});

test("if the consent cannot be written she is not let through", async () => {
  // The failure this whole feature exists to prevent: an onboarded participant
  // with no record that she ever agreed.
  const s = session({ state: "awaiting_privacy_consent", language: "en" });
  const { deps: d } = deps({ recordConsent: async () => false });
  const reply = await transition(s, "CONTINUE", d);

  assert.equal(reply.state, "awaiting_privacy_consent");
  assert.notEqual(reply.state, "awaiting_name");
});

test("after the name comes location, not the language question again", async () => {
  const s = session({ state: "awaiting_name", language: "en" });
  const { deps: d } = deps();
  const reply = await transition(s, "Adaeze Okonkwo", d);
  assert.equal(reply.state, "awaiting_state");
  assert.equal(s.name, "Adaeze Okonkwo");
});

// --- erasure ----------------------------------------------------------------

test("the confirmation names what she loses before she can agree", async () => {
  const s = session({ state: "privacy_menu", language: "en", name: "Ada" });
  const { deps: d, erasures } = deps();
  const reply = await transition(s, "Delete my info", d);

  assert.equal(reply.state, "awaiting_erase_confirm");
  assert.match(reply.reply, /cannot be undone/i);
  assert.match(reply.reply, /certificate/i, "losing the certificate is the least expected consequence");
  assert.equal(erasures.length, 0, "nothing is deleted at the request step");
});

test("keeping her information changes nothing", async () => {
  const s = session({ state: "privacy_menu", language: "en", name: "Ada" });
  const { deps: d, erasures } = deps();
  const reply = await transition(s, "No, keep it", d);
  assert.equal(reply.state, "main_menu");
  assert.equal(erasures.length, 0);
});

test("confirming erases, and hands back a reference", async () => {
  const s = session({ state: "awaiting_erase_confirm", language: "en", name: "Ada" });
  const { deps: d, erasures } = deps();
  const reply = await transition(s, "Yes, delete it", d);

  assert.deepEqual(erasures, ["2348000000001"]);
  assert.match(reply.reply, /AB12-CD34/, "she needs the reference to ask whether it was done");
  assert.equal(s._erased, true, "the turn must mark itself terminal so the session is not resurrected");
});

test("an unclear answer at the confirmation does NOT delete anything", async () => {
  // On an irreversible action the unreadable answer has to resolve to not
  // doing it.
  const s = session({ state: "awaiting_erase_confirm", language: "en", name: "Ada" });
  const { deps: d, erasures } = deps();
  const reply = await transition(s, "hmm", d);

  assert.equal(erasures.length, 0);
  assert.equal(reply.state, "main_menu");
  assert.match(reply.reply, /nothing has been deleted/i);
});

test("cancelling does not delete anything", async () => {
  const s = session({ state: "awaiting_erase_confirm", language: "en", name: "Ada" });
  const { deps: d, erasures } = deps();
  await transition(s, "Cancel", d);
  assert.equal(erasures.length, 0);
});

test("a failed erasure says so and leaves her session intact", async () => {
  const s = session({ state: "awaiting_erase_confirm", language: "en", name: "Ada" });
  const { deps: d } = deps({ erase: async () => ({ status: "failed" }) });
  const reply = await transition(s, "Yes, delete it", d);

  assert.match(reply.reply, /nothing has been deleted/i);
  assert.notEqual(s._erased, true, "a failed erasure must not mark the turn terminal");
});

// --- the copy has to fit ----------------------------------------------------

test("the notice fits in an interactive message body", () => {
  // Over the limit WhatsApp rejects the WHOLE message rather than truncating
  // it, so an overrun means her very first interaction fails silently.
  const notice = BOT_PROMPT_DEFAULTS.privacy_notice?.en ?? "";
  assert.ok(notice.length > 0);
  assert.ok(
    notice.length <= WHATSAPP_LIMITS.interactiveBody,
    `notice is ${notice.length}, limit is ${WHATSAPP_LIMITS.interactiveBody}`
  );
});

test("every privacy button fits the reply-button title limit", () => {
  for (const key of [
    "privacy_accept_label",
    "privacy_decline_label",
    "privacy_erase_button",
    "privacy_keep_button",
    "privacy_erase_confirm_button",
    "privacy_erase_cancel_button"
  ]) {
    const label = BOT_PROMPT_DEFAULTS[key]?.en ?? "";
    assert.ok(label.length > 0, `${key} is empty`);
    assert.ok(
      label.length <= WHATSAPP_LIMITS.buttonTitle,
      `${key} is ${label.length}, limit is ${WHATSAPP_LIMITS.buttonTitle}`
    );
  }
});

test("the erase confirmation carries the reference placeholder", () => {
  assert.match(BOT_PROMPT_DEFAULTS.privacy_erase_done?.en ?? "", /\{ref\}/);
});
