import test from "node:test";
import assert from "node:assert/strict";
import {
  BOT_PROMPT_DEFAULTS,
  BOT_PROMPT_TITLES,
  BOT_PROMPT_CONFIG_PREFIX
} from "./bot-prompts.js";

test("every bot prompt default has en text and a human title", () => {
  for (const [key, value] of Object.entries(BOT_PROMPT_DEFAULTS)) {
    assert.equal(typeof value.en, "string", `${key} is missing en`);
    assert.ok(BOT_PROMPT_TITLES[key], `${key} is missing a title`);
  }
});

test("config prefix is the content-namespace bot.prompt. prefix", () => {
  assert.equal(BOT_PROMPT_CONFIG_PREFIX, "bot.prompt.");
});

test("core conversation prompts are present and localized", () => {
  for (const key of ["quiz_time_header", "correct_next", "bot_did_not_understand", "state_prompt"]) {
    const value = BOT_PROMPT_DEFAULTS[key];
    assert.ok(value, `${key} default missing`);
    assert.ok(value.en && value.pcm && value.ig, `${key} should have en/pcm/ig`);
  }
});
