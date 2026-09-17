import test from "node:test";
import assert from "node:assert/strict";
import { rewardsFilterQuerySchema, usersFilterQuerySchema } from "./admin.js";

// GAP-D2: reward list filters must be coerced/validated before reaching SQL.
// Previously `Number("abc")` produced `LIMIT NaN` and `new Date("abc")` an
// Invalid Date.

test("valid filters are coerced to their proper types", () => {
  const parsed = rewardsFilterQuerySchema.parse({
    status: "Issued",
    from: "2026-01-01",
    to: "2026-02-01",
    q: "  ada  ",
    cursor: "abc123",
    limit: "25"
  });
  assert.equal(parsed.status, "Issued");
  assert.ok(parsed.from instanceof Date && !Number.isNaN(parsed.from.getTime()));
  assert.ok(parsed.to instanceof Date && !Number.isNaN(parsed.to.getTime()));
  assert.equal(parsed.q, "ada"); // trimmed
  assert.equal(parsed.limit, 25);
});

test("garbage limit is dropped instead of becoming NaN", () => {
  const parsed = rewardsFilterQuerySchema.parse({ limit: "not-a-number" });
  assert.equal(parsed.limit, undefined);
});

test("limit is clamped out of range (0 and 5000 rejected)", () => {
  assert.equal(rewardsFilterQuerySchema.parse({ limit: "0" }).limit, undefined);
  assert.equal(rewardsFilterQuerySchema.parse({ limit: "5000" }).limit, undefined);
});

test("unparseable dates are dropped instead of becoming Invalid Date", () => {
  const parsed = rewardsFilterQuerySchema.parse({ from: "not-a-date", to: "???" });
  assert.equal(parsed.from, undefined);
  assert.equal(parsed.to, undefined);
});

test("over-long q / cursor are dropped (200 char cap)", () => {
  const parsed = rewardsFilterQuerySchema.parse({
    q: "x".repeat(201),
    cursor: "y".repeat(201)
  });
  assert.equal(parsed.q, undefined);
  assert.equal(parsed.cursor, undefined);
});

test("an invalid status does not discard the other valid filters", () => {
  const parsed = rewardsFilterQuerySchema.parse({ status: "Bogus", limit: "10", q: "ada" });
  assert.equal(parsed.status, undefined);
  assert.equal(parsed.limit, 10);
  assert.equal(parsed.q, "ada");
});

// The learner directory filters follow the same rules.

test("users: valid filters are coerced, and flagged arrives as a real boolean", () => {
  const parsed = usersFilterQuerySchema.parse({
    q: "  ada ",
    cursor: "2026-09-16T15:04:05.123Z~abc",
    limit: "50",
    flagged: "true",
    status: "At Risk"
  });
  assert.equal(parsed.q, "ada");
  assert.equal(parsed.cursor, "2026-09-16T15:04:05.123Z~abc");
  assert.equal(parsed.limit, 50);
  assert.equal(parsed.flagged, true);
  assert.equal(parsed.status, "At Risk");
  assert.equal(usersFilterQuerySchema.parse({ flagged: "false" }).flagged, false);
});

test("users: a bad field is dropped on its own and never discards the good ones", () => {
  const parsed = usersFilterQuerySchema.parse({ limit: "5000", flagged: "yes", status: "Dormant", q: "ok" });
  assert.equal(parsed.limit, undefined, "an out-of-range limit is dropped; the provider applies its default");
  assert.equal(parsed.flagged, undefined);
  assert.equal(parsed.status, undefined);
  assert.equal(parsed.q, "ok");
});

test("users: over-long q and cursor are dropped (200 / 300 char caps)", () => {
  const parsed = usersFilterQuerySchema.parse({ q: "a".repeat(201), cursor: "b".repeat(301) });
  assert.equal(parsed.q, undefined);
  assert.equal(parsed.cursor, undefined);
});
