import test from "node:test";
import assert from "node:assert/strict";
import { decodeUsersCursor, encodeUsersCursor, summarizeUsersRow } from "./users-directory.js";

test("a cursor round-trips through its opaque string", () => {
  const createdAt = new Date("2026-09-16T15:04:05.123Z");
  const id = "0f1e2d3c-4b5a-6978-8a9b-0c1d2e3f4a5b";
  const decoded = decodeUsersCursor(encodeUsersCursor({ createdAt, id }));
  assert.deepEqual(decoded, { createdAt, id });
});

test("the cursor keeps millisecond precision, which is what makes ties resolvable", () => {
  const createdAt = new Date("2026-09-16T15:04:05.999Z");
  const decoded = decodeUsersCursor(encodeUsersCursor({ createdAt, id: "x" }));
  assert.equal(decoded?.createdAt.getTime(), createdAt.getTime());
});

test("garbage is null, never a cursor pointing somewhere arbitrary", () => {
  assert.equal(decodeUsersCursor(undefined), null);
  assert.equal(decodeUsersCursor(""), null);
  assert.equal(decodeUsersCursor("no-separator"), null);
  assert.equal(decodeUsersCursor("~id-only"), null);
  assert.equal(decodeUsersCursor("2026-09-16T15:04:05.123Z~"), null);
  assert.equal(decodeUsersCursor("not-a-date~id"), null);
  assert.equal(decodeUsersCursor(`2026-09-16T15:04:05.123Z~${"a".repeat(201)}`), null);
});

test("the summary row folds Postgres text counts into numbers", () => {
  const summary = summarizeUsersRow({
    total: "30689",
    active: "27450",
    atRisk: "3239",
    flagged: "412",
    averageCompletionPct: "41.6666666"
  });
  assert.deepEqual(summary, { total: 30689, active: 27450, atRisk: 3239, flagged: 412, averageCompletionPct: 41.7 });
});

test("a missing or malformed summary row is zeros, not NaN", () => {
  assert.deepEqual(summarizeUsersRow(undefined), { total: 0, active: 0, atRisk: 0, flagged: 0, averageCompletionPct: 0 });
  assert.deepEqual(summarizeUsersRow({ total: "many", active: null, atRisk: -4, flagged: {}, averageCompletionPct: "x" }), {
    total: 0,
    active: 0,
    atRisk: 0,
    flagged: 0,
    averageCompletionPct: 0
  });
});
