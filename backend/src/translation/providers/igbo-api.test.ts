import test from "node:test";
import assert from "node:assert/strict";
import { createIgboApiAdapter } from "./igbo-api.js";
import { translationIntegrationPayloadSchema } from "./contracts.js";

const CONFIG = translationIntegrationPayloadSchema.parse({
  title: "t",
  providerByLanguage: { pcm: "gemini", ig: "igbo_api" },
  igboApi: { apiKey: "test-key", baseUrl: "https://igboapi.com", dailyRequestLimit: 2500 }
});

function stubFetch(handler: (url: string, init: RequestInit) => Response) {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const impl = (async (url: unknown, init: unknown) => {
    calls.push({ url: String(url), init: init as RequestInit });
    return handler(String(url), init as RequestInit);
  }) as unknown as typeof fetch;
  return { impl, calls };
}

function ok(translation: string) {
  return new Response(JSON.stringify({ translation }), { status: 200 });
}

test("posts to the documented endpoint with the API-key header", () => {
  const { impl, calls } = stubFetch(() => ok("mmiri"));
  const adapter = createIgboApiAdapter({ fetchImpl: impl });
  return adapter
    .translate([{ id: "a", text: "water", targetLanguage: "ig" }], CONFIG)
    .then(() => {
      assert.equal(calls[0]?.url, "https://igboapi.com/api/v2/translate");
      const headers = calls[0]?.init.headers as Record<string, string>;
      assert.equal(headers["X-API-Key"], "test-key");
      const body = JSON.parse(String(calls[0]?.init.body));
      assert.equal(body.text, "water");
      assert.equal(body.sourceLanguageCode, "eng");
      assert.equal(body.destinationLanguageCode, "ibo");
    });
});

test("a trailing slash on the base URL does not produce a double slash", () => {
  const { impl, calls } = stubFetch(() => ok("mmiri"));
  const adapter = createIgboApiAdapter({ fetchImpl: impl });
  const config = { ...CONFIG, igboApi: { ...CONFIG.igboApi, baseUrl: "https://igboapi.com/" } };
  return adapter
    .translate([{ id: "a", text: "water", targetLanguage: "ig" }], config)
    .then(() => {
      assert.equal(calls[0]?.url, "https://igboapi.com/api/v2/translate");
    });
});

test("Pidgin is refused rather than silently mistranslated", async () => {
  // The API is eng<->ibo only. Sending pcm at it would return Igbo text
  // labelled as Pidgin, which is worse than an error.
  const { impl, calls } = stubFetch(() => ok("should not be called"));
  const adapter = createIgboApiAdapter({ fetchImpl: impl });
  const [outcome] = await adapter.translate(
    [{ id: "a", text: "hello", targetLanguage: "pcm" }],
    CONFIG
  );
  assert.equal(outcome?.status, "failed");
  assert.equal(calls.length, 0, "must not spend a request on an unsupported language");
  assert.match((outcome as { reason: string }).reason, /Pidgin/i);
  assert.equal((outcome as { retryable: boolean }).retryable, false);
});

test("a result longer than its budget is flagged, not truncated", async () => {
  // Truncating Igbo mid-word to hit a 20-char button limit produces nonsense
  // the reviewer has to rewrite anyway — better to surface it.
  const { impl } = stubFetch(() => ok("okwu ogologo nke gafere oke"));
  const adapter = createIgboApiAdapter({ fetchImpl: impl });
  const [outcome] = await adapter.translate(
    [{ id: "a", text: "a long option", targetLanguage: "ig", maxLength: 20 }],
    CONFIG
  );
  assert.equal(outcome?.status, "translated");
  assert.equal((outcome as { overBudget: boolean }).overBudget, true);
  assert.equal((outcome as { text: string }).text, "okwu ogologo nke gafere oke");
});

test("a result inside its budget is not flagged", async () => {
  const { impl } = stubFetch(() => ok("mmiri"));
  const adapter = createIgboApiAdapter({ fetchImpl: impl });
  const [outcome] = await adapter.translate(
    [{ id: "a", text: "water", targetLanguage: "ig", maxLength: 20 }],
    CONFIG
  );
  assert.equal((outcome as { overBudget: boolean }).overBudget, false);
});

test("429 is retryable so quota exhaustion does not discard the work", async () => {
  const { impl } = stubFetch(() => new Response("rate limited", { status: 429 }));
  const adapter = createIgboApiAdapter({ fetchImpl: impl });
  const [outcome] = await adapter.translate(
    [{ id: "a", text: "water", targetLanguage: "ig" }],
    CONFIG
  );
  assert.equal(outcome?.status, "failed");
  assert.equal((outcome as { retryable: boolean }).retryable, true);
});

test("a 400 is not retryable", async () => {
  const { impl } = stubFetch(() => new Response("bad", { status: 400 }));
  const adapter = createIgboApiAdapter({ fetchImpl: impl });
  const [outcome] = await adapter.translate(
    [{ id: "a", text: "water", targetLanguage: "ig" }],
    CONFIG
  );
  assert.equal((outcome as { retryable: boolean }).retryable, false);
});

test("an empty translation is reported as a failure, not an empty success", async () => {
  // Writing "" into a lesson would blank real content on approval.
  const { impl } = stubFetch(() => ok("   "));
  const adapter = createIgboApiAdapter({ fetchImpl: impl });
  const [outcome] = await adapter.translate(
    [{ id: "a", text: "water", targetLanguage: "ig" }],
    CONFIG
  );
  assert.equal(outcome?.status, "failed");
});

test("one failure does not abort the remaining units", async () => {
  let call = 0;
  const { impl } = stubFetch(() => {
    call += 1;
    return call === 2 ? new Response("boom", { status: 500 }) : ok("mmiri");
  });
  const adapter = createIgboApiAdapter({ fetchImpl: impl });
  const outcomes = await adapter.translate(
    [
      { id: "a", text: "one", targetLanguage: "ig" },
      { id: "b", text: "two", targetLanguage: "ig" },
      { id: "c", text: "three", targetLanguage: "ig" }
    ],
    CONFIG
  );
  assert.equal(outcomes.length, 3);
  assert.equal(outcomes[0]?.status, "translated");
  assert.equal(outcomes[1]?.status, "failed");
  assert.equal(outcomes[2]?.status, "translated");
});

test("verifyCredentials refuses to call upstream without a key", async () => {
  const { impl, calls } = stubFetch(() => ok("mmiri"));
  const adapter = createIgboApiAdapter({ fetchImpl: impl });
  const result = await adapter.verifyCredentials({
    ...CONFIG,
    igboApi: { ...CONFIG.igboApi, apiKey: "" }
  });
  assert.equal(result.status, "failed");
  assert.equal(calls.length, 0);
});

test("verifyCredentials reports quota exhaustion as degraded, not failed", async () => {
  // The key is fine; only the daily budget is spent. Calling that "failed"
  // would send an admin looking for a credentials problem.
  const { impl } = stubFetch(() => new Response("rate limited", { status: 429 }));
  const adapter = createIgboApiAdapter({ fetchImpl: impl });
  const result = await adapter.verifyCredentials(CONFIG);
  assert.equal(result.status, "degraded");
  assert.match(result.message, /daily request limit/i);
});

test("verifyCredentials succeeds on a real translation", async () => {
  const { impl } = stubFetch(() => ok("mmiri"));
  const adapter = createIgboApiAdapter({ fetchImpl: impl });
  const result = await adapter.verifyCredentials(CONFIG);
  assert.equal(result.status, "healthy");
});
