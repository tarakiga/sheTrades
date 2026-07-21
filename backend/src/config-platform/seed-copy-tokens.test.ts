import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * Regression guard for the "My Progress always reads 0%" bug (UX Review Round 3,
 * Flow 10).
 *
 * The seeded value for `bot.progress.summary` was:
 *   "{name}, your current completion is 0%. Reply 1 to start Module 1."
 *
 * `{name}` interpolated, so the message looked like a working feature — but the
 * percentage was a LITERAL and the `{percentage}` token was absent entirely, so
 * `handler.ts`'s `.replace("{percentage}", …)` was a silent no-op. Every learner
 * saw 0% forever, including one who had finished every module. Published config
 * overrides the code default, so a correct default in code cannot save us here.
 *
 * These tests pin the token contract between handler.ts and the seed file: if a
 * template drops a token its code path substitutes, or re-introduces a hardcoded
 * count/module reference, CI fails instead of a learner seeing a wrong number.
 */

type SeedEntry = { key: string; title: string; content: Record<string, string> };

const SEED_PATH = path.resolve(
  import.meta.dirname,
  "..",
  "..",
  "..",
  "docs",
  "config-seeds",
  "admin-ui-copy.seed.json"
);

const entries = JSON.parse(readFileSync(SEED_PATH, "utf8")) as SeedEntry[];

/**
 * Keys whose runtime text is built by `.replace()` in handler.ts, mapped to the
 * tokens that must survive into the published copy. Add a row here whenever a
 * new `getRuntimeText(...).replace("{token}", …)` call site is introduced.
 */
const REQUIRED_TOKENS: Record<string, string[]> = {
  "bot.progress.summary": ["{name}", "{percentage}", "{completedCount}", "{totalCount}"]
};

/** A bare number next to %, or a literal "Module N", means a value got baked in. */
const HARDCODED_VALUE = /\d+\s*%|Module\s*\d+|\b\d+\s+out of\s+\d+/;

function entryFor(key: string): SeedEntry {
  const found = entries.find((e) => e.key === key);
  assert.ok(found, `Seed file is missing the key "${key}"`);
  return found;
}

for (const [key, tokens] of Object.entries(REQUIRED_TOKENS)) {
  test(`${key} keeps every interpolation token in all languages`, () => {
    const entry = entryFor(key);
    for (const [lang, value] of Object.entries(entry.content)) {
      for (const token of tokens) {
        assert.ok(
          value.includes(token),
          `${key}[${lang}] is missing ${token}. Without it the substitution is a ` +
            `silent no-op and learners see a stale hardcoded value.\nGot: ${value}`
        );
      }
    }
  });

  test(`${key} hardcodes no counts, percentages, or module numbers`, () => {
    const entry = entryFor(key);
    for (const [lang, value] of Object.entries(entry.content)) {
      const match = value.match(HARDCODED_VALUE);
      assert.equal(
        match,
        null,
        `${key}[${lang}] hardcodes "${match?.[0]}" — this is the Round 3 Flow 10 ` +
          `bug. Use a token so the value reflects real progress.\nGot: ${value}`
      );
    }
  });
}

test("every seed entry defines copy for all three languages", () => {
  const missing = entries
    .filter((e) => !e.content?.en || !e.content?.pcm || !e.content?.ig)
    .map((e) => e.key);
  assert.deepEqual(
    missing,
    [],
    `Seed entries missing a language variant fall back to English for Pidgin/Igbo learners: ${missing.join(", ")}`
  );
});
