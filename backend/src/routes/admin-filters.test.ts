import test from "node:test";
import assert from "node:assert/strict";
import { rewardsFilterQuerySchema } from "./admin.js";

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
