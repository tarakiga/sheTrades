import test from "node:test";
import assert from "node:assert/strict";

import { formatWat } from "./wat.js";

test("formatWat shifts UTC by one hour and drops seconds", () => {
  assert.equal(formatWat("2026-09-17T18:12:45.000Z"), "2026-09-17 19:12");
  assert.equal(formatWat(new Date("2026-09-30T23:30:00.000Z")), "2026-10-01 00:30", "a late UTC evening is the next WAT morning");
});

test("formatWat is blank for anything that is not a date", () => {
  assert.equal(formatWat(null), "");
  assert.equal(formatWat(undefined), "");
  assert.equal(formatWat(""), "");
  assert.equal(formatWat("last Tuesday"), "");
});
