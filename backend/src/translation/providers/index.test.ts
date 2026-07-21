import test from "node:test";
import assert from "node:assert/strict";
import { selectTranslationAdapter } from "./index.js";

test("igbo_api selects the Igbo adapter", () => {
  assert.equal(selectTranslationAdapter("igbo_api").key, "igbo_api");
});

test("gemini and anthropic select the LLM adapter with the right key", () => {
  assert.equal(selectTranslationAdapter("gemini").key, "gemini");
  assert.equal(selectTranslationAdapter("anthropic").key, "anthropic");
});

test("the Igbo adapter does not claim Pidgin support", () => {
  assert.ok(!selectTranslationAdapter("igbo_api").supports.includes("pcm"));
});

test("the LLM adapters claim both languages", () => {
  assert.deepEqual([...selectTranslationAdapter("gemini").supports].sort(), ["ig", "pcm"]);
});
