import test from "node:test";
import assert from "node:assert/strict";
import { sendWhatsAppMessage, type OutboundReply } from "./sender.js";
import * as runtimeConfig from "../config-platform/runtime-config.js";

const realCfg = runtimeConfig.getRuntimeWhatsAppConfig;

function stubConfig(cfg: unknown) {
  (runtimeConfig as unknown as { getRuntimeWhatsAppConfig: () => unknown }).getRuntimeWhatsAppConfig = () => cfg;
}
function restoreConfig() {
  (runtimeConfig as unknown as { getRuntimeWhatsAppConfig: typeof realCfg }).getRuntimeWhatsAppConfig = realCfg;
}

function stubFetch(status = 200, body: unknown = { messages: [{ id: "wamid.1" }] }) {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  globalThis.fetch = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    return new Response(JSON.stringify(body), { status });
  }) as typeof fetch;
  return calls;
}

const cfg = { accessToken: "tok", phoneNumberId: "pn1", apiVersion: "v23.0" };

test("no-op (no fetch) when no WhatsApp config is published", async () => {
  stubConfig(null);
  let fetched = false;
  globalThis.fetch = (async () => { fetched = true; return new Response("{}"); }) as typeof fetch;
  await sendWhatsAppMessage("+234800", { text: "hi" });
  assert.equal(fetched, false);
  restoreConfig();
});

test("sends a text message to the correct URL with bearer auth", async () => {
  stubConfig(cfg);
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
  restoreConfig();
});

test("sends interactive buttons (max 3, reply shape)", async () => {
  stubConfig(cfg);
  const calls = stubFetch();
  await sendWhatsAppMessage("+234800", { text: "pick", buttons: ["A", "B", "C", "D"] });
  const sent = JSON.parse(calls[0]!.init.body as string);
  assert.equal(sent.type, "interactive");
  assert.equal(sent.interactive.type, "button");
  assert.equal(sent.interactive.action.buttons.length, 3);
  assert.equal(sent.interactive.action.buttons[0].type, "reply");
  assert.equal(sent.interactive.action.buttons[0].reply.title, "A");
  restoreConfig();
});

test("sends an interactive list", async () => {
  stubConfig(cfg);
  const calls = stubFetch();
  const reply: OutboundReply = {
    text: "Which state?",
    list: { button: "Choose state", sections: [{ title: "States", rows: [{ id: "anambra", title: "Anambra" }, { id: "delta", title: "Delta" }] }] }
  };
  await sendWhatsAppMessage("+234800", reply);
  const sent = JSON.parse(calls[0]!.init.body as string);
  assert.equal(sent.interactive.type, "list");
  assert.equal(sent.interactive.body.text, "Which state?");
  assert.equal(sent.interactive.action.button, "Choose state");
  assert.equal(sent.interactive.action.sections[0].rows.length, 2);
  assert.equal(sent.interactive.action.sections[0].rows[1].title, "Delta");
  restoreConfig();
});

test("truncates over-long button and row titles", async () => {
  stubConfig(cfg);
  const calls = stubFetch();
  await sendWhatsAppMessage("+234800", { text: "x", buttons: ["A".repeat(40)] });
  const sent = JSON.parse(calls[0]!.init.body as string);
  assert.ok(sent.interactive.action.buttons[0].reply.title.length <= 20);
  restoreConfig();
});

test("does not throw on non-2xx", async () => {
  stubConfig(cfg);
  stubFetch(500, { error: "boom" });
  await sendWhatsAppMessage("+234800", { text: "hi" }); // must resolve, not reject
  restoreConfig();
});
