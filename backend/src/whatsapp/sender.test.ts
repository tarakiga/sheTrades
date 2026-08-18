import test from "node:test";
import assert from "node:assert/strict";
import { sendWhatsAppMessage, sendWhatsAppOutreach, type OutboundReply } from "./sender.js";
import { setRuntimeIntegrationConfigForTests } from "../config-platform/runtime-config.js";

// getRuntimeWhatsAppConfig() reads integration.whatsapp.primary from the
// in-memory runtime cache. ESM named exports cannot be monkeypatched (the
// module namespace is read-only on Node 24), so we stub via the project's
// dedicated test seam instead.
const WA_KEY = "integration.whatsapp.primary";
const cfg = { accessToken: "tok", phoneNumberId: "pn1", apiVersion: "v23.0" };

function publishConfig(value: unknown) {
  setRuntimeIntegrationConfigForTests(WA_KEY, value);
}

function stubFetch(status = 200, body: unknown = { messages: [{ id: "wamid.1" }] }) {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  globalThis.fetch = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    return new Response(JSON.stringify(body), { status });
  }) as typeof fetch;
  return calls;
}

test("no-op (no fetch) when no WhatsApp config is published", async () => {
  publishConfig(null);
  let fetched = false;
  globalThis.fetch = (async () => {
    fetched = true;
    return new Response("{}");
  }) as typeof fetch;
  await sendWhatsAppMessage("+234800", { text: "hi" });
  assert.equal(fetched, false);
});

test("sends a text message to the correct URL with bearer auth", async () => {
  publishConfig(cfg);
  const calls = stubFetch();
  await sendWhatsAppMessage("+234800", { text: "hello" });
  assert.equal(calls.length, 1);
  assert.equal(calls[0]!.url, "https://graph.facebook.com/v23.0/pn1/messages");
  const headers = new Headers(calls[0]!.init.headers);
  assert.equal(headers.get("authorization"), "Bearer tok");
  const sent = JSON.parse(calls[0]!.init.body as string);
  assert.equal(sent.messaging_product, "whatsapp");
  assert.equal(sent.to, "+234800");
  assert.equal(sent.type, "text");
  assert.equal(sent.text.body, "hello");
  publishConfig(null);
});

test("sends interactive buttons (max 3, reply shape)", async () => {
  publishConfig(cfg);
  const calls = stubFetch();
  await sendWhatsAppMessage("+234800", { text: "pick", buttons: ["A", "B", "C", "D"] });
  const sent = JSON.parse(calls[0]!.init.body as string);
  assert.equal(sent.type, "interactive");
  assert.equal(sent.interactive.type, "button");
  assert.equal(sent.interactive.action.buttons.length, 3);
  assert.equal(sent.interactive.action.buttons[0].type, "reply");
  assert.equal(sent.interactive.action.buttons[0].reply.title, "A");
  publishConfig(null);
});

test("sends an interactive list", async () => {
  publishConfig(cfg);
  const calls = stubFetch();
  const reply: OutboundReply = {
    text: "Which state?",
    list: {
      button: "Choose state",
      sections: [
        {
          title: "States",
          rows: [
            { id: "anambra", title: "Anambra" },
            { id: "delta", title: "Delta" }
          ]
        }
      ]
    }
  };
  await sendWhatsAppMessage("+234800", reply);
  const sent = JSON.parse(calls[0]!.init.body as string);
  assert.equal(sent.interactive.type, "list");
  assert.equal(sent.interactive.body.text, "Which state?");
  assert.equal(sent.interactive.action.button, "Choose state");
  assert.equal(sent.interactive.action.sections[0].rows.length, 2);
  assert.equal(sent.interactive.action.sections[0].rows[1].title, "Delta");
  publishConfig(null);
});

test("truncates over-long button and row titles", async () => {
  publishConfig(cfg);
  const calls = stubFetch();
  await sendWhatsAppMessage("+234800", { text: "x", buttons: ["A".repeat(40)] });
  const sent = JSON.parse(calls[0]!.init.body as string);
  assert.ok(sent.interactive.action.buttons[0].reply.title.length <= 20);
  publishConfig(null);
});

test("does not throw on non-2xx", async () => {
  publishConfig(cfg);
  stubFetch(500, { error: "boom" });
  await sendWhatsAppMessage("+234800", { text: "hi" }); // must resolve, not reject
  publishConfig(null);
});

// ---- sendWhatsAppOutreach (operator-initiated Contact Learner sends) ----

test("outreach reports failure (not silence) when no config is published", async () => {
  publishConfig(null);
  const result = await sendWhatsAppOutreach("+234800", { kind: "text", text: "hi" });
  assert.equal(result.status, "failed");
  assert.match((result as { reason: string }).reason, /No WhatsApp integration/);
});

test("outreach template send builds a Meta template message and returns the id", async () => {
  publishConfig(cfg);
  const calls = stubFetch(200, { messages: [{ id: "wamid.777" }] });
  const result = await sendWhatsAppOutreach("+234800", {
    kind: "template",
    templateName: "hello_world",
    languageCode: "en_US"
  });
  const sent = JSON.parse(calls[0]!.init.body as string);
  assert.equal(sent.type, "template");
  assert.equal(sent.template.name, "hello_world");
  assert.equal(sent.template.language.code, "en_US");
  assert.deepEqual(result, { status: "sent", providerMessageId: "wamid.777" });
  publishConfig(null);
});

test("outreach surfaces a Meta rejection as a failed result with the reason", async () => {
  publishConfig(cfg);
  stubFetch(400, { error: { message: "template not found" } });
  const result = await sendWhatsAppOutreach("+234800", {
    kind: "template",
    templateName: "nope",
    languageCode: "en"
  });
  assert.equal(result.status, "failed");
  assert.match((result as { reason: string }).reason, /HTTP 400/);
  publishConfig(null);
});

test("outreach image send links the media and carries the caption", async () => {
  publishConfig(cfg);
  const calls = stubFetch(200, { messages: [{ id: "wamid.888" }] });
  const result = await sendWhatsAppOutreach("+234800", {
    kind: "image",
    link: "https://example.test/c/abc.png",
    caption: "Congratulations!"
  });
  const sent = JSON.parse(calls[0]!.init.body as string);
  assert.equal(sent.type, "image");
  // A `link` (not an uploaded media id) is what makes the certificate route
  // the single delivery mechanism: Meta fetches the same public URL a browser
  // would, so there is no upload step to keep in sync.
  assert.equal(sent.image.link, "https://example.test/c/abc.png");
  assert.equal(sent.image.caption, "Congratulations!");
  assert.deepEqual(result, { status: "sent", providerMessageId: "wamid.888" });
  publishConfig(null);
});

test("outreach image send omits the caption KEY entirely when there is no caption", async () => {
  publishConfig(cfg);
  const calls = stubFetch();
  await sendWhatsAppOutreach("+234800", { kind: "image", link: "https://example.test/c/abc.png" });
  const sent = JSON.parse(calls[0]!.init.body as string);
  assert.equal(sent.type, "image");
  // Not merely undefined: Meta rejects an explicit null/empty caption, and
  // JSON.stringify drops an undefined value but NOT a key set to "". Asserting
  // on the key list is the only version of this check that can fail.
  assert.deepEqual(Object.keys(sent.image), ["link"]);
  publishConfig(null);
});
