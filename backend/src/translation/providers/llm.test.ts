import test from "node:test";
import assert from "node:assert/strict";
import { createLlmAdapter } from "./llm.js";
import { translationIntegrationPayloadSchema } from "./contracts.js";

const CONFIG = translationIntegrationPayloadSchema.parse({
  title: "t",
  providerByLanguage: { pcm: "gemini", ig: "gemini" },
  gemini: { apiKey: "g-key", model: "gemini-2.5-flash" }
});

function stubFetch(reply: (body: string) => { status: number; json: unknown }) {
  const calls: string[] = [];
  const impl = (async (_url: unknown, init: unknown) => {
    const body = String((init as RequestInit).body ?? "");
    calls.push(body);
    const r = reply(body);
    return new Response(JSON.stringify(r.json), { status: r.status });
  }) as unknown as typeof fetch;
  return { impl, calls };
}

function geminiOk(text: string) {
  return { status: 200, json: { candidates: [{ content: { parts: [{ text }] } }] } };
}

test("produces Pidgin — the language no translation API supports", async () => {
  const { impl } = stubFetch(() => geminiOk("How you dey run your shop?"));
  const adapter = createLlmAdapter("gemini", { fetchImpl: impl });
  const [out] = await adapter.translate(
    [{ id: "body", text: "How do you run your shop?", targetLanguage: "pcm" }],
    CONFIG
  );
  assert.equal(out?.status, "translated");
  assert.equal((out as { text: string }).text, "How you dey run your shop?");
});

test("the length budget is put in the prompt", async () => {
  const { impl, calls } = stubFetch(() => geminiOk("Katalog"));
  const adapter = createLlmAdapter("gemini", { fetchImpl: impl });
  await adapter.translate(
    [{ id: "q0.opt0", text: "Catalog", targetLanguage: "ig", maxLength: 20, context: "quiz answer button" }],
    CONFIG
  );
  assert.match(calls[0] ?? "", /20/);
  assert.match(calls[0] ?? "", /quiz answer button/);
});

test("a result over budget is flagged, not truncated", async () => {
  const { impl } = stubFetch(() => geminiOk("a translation that is definitely longer than twenty"));
  const adapter = createLlmAdapter("gemini", { fetchImpl: impl });
  const [out] = await adapter.translate(
    [{ id: "q0.opt0", text: "x", targetLanguage: "ig", maxLength: 20 }],
    CONFIG
  );
  assert.equal((out as { overBudget: boolean }).overBudget, true);
  assert.equal((out as { text: string }).text.length > 20, true);
});

test("model surrounding prose is stripped to just the translation", async () => {
  const { impl } = stubFetch(() => geminiOk('Here is the translation: "Katalog"'));
  const adapter = createLlmAdapter("gemini", { fetchImpl: impl });
  const [out] = await adapter.translate(
    [{ id: "q0.opt0", text: "Catalog", targetLanguage: "ig" }],
    CONFIG
  );
  assert.equal((out as { text: string }).text, "Katalog");
});

test("an HTTP 429 is retryable", async () => {
  const { impl } = stubFetch(() => ({ status: 429, json: {} }));
  const adapter = createLlmAdapter("gemini", { fetchImpl: impl });
  const [out] = await adapter.translate([{ id: "a", text: "x", targetLanguage: "ig" }], CONFIG);
  assert.equal(out?.status, "failed");
  assert.equal((out as { retryable: boolean }).retryable, true);
});

test("an empty model response is a failure, not an empty success", async () => {
  const { impl } = stubFetch(() => geminiOk("   "));
  const adapter = createLlmAdapter("gemini", { fetchImpl: impl });
  const [out] = await adapter.translate([{ id: "a", text: "x", targetLanguage: "ig" }], CONFIG);
  assert.equal(out?.status, "failed");
});

test("verifyCredentials fails fast without an API key", async () => {
  const { impl, calls } = stubFetch(() => geminiOk("x"));
  const adapter = createLlmAdapter("gemini", { fetchImpl: impl });
  const result = await adapter.verifyCredentials({
    ...CONFIG,
    gemini: { apiKey: "", model: "gemini-2.5-flash" }
  });
  assert.equal(result.status, "failed");
  assert.equal(calls.length, 0);
});
