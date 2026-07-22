import test from "node:test";
import assert from "node:assert/strict";

import { formatNgn, formatRelativeTime } from "./format.js";

test("formatNgn renders amounts with the ₦ symbol and thousands separators", () => {
  const small = formatNgn(500);
  const large = formatNgn(1500);
  assert.match(small, /₦/);
  assert.match(small, /500\.00/);
  assert.match(large, /₦/);
  assert.match(large, /1,500\.00/);
});

test("formatRelativeTime returns 'just now' for <1 min", () => {
  assert.equal(formatRelativeTime(new Date()), "just now");
});

test("formatRelativeTime returns 'N min ago'", () => {
  const past = new Date(Date.now() - 5 * 60_000);
  assert.match(formatRelativeTime(past), /5 min ago/);
});

test("formatRelativeTime returns 'N h ago'", () => {
  const past = new Date(Date.now() - 3 * 3_600_000);
  assert.match(formatRelativeTime(past), /3 h ago/);
});

test("formatRelativeTime returns absolute date for >7 days", () => {
  const past = new Date(Date.now() - 10 * 86_400_000);
  assert.match(formatRelativeTime(past), /^\d{4}-\d{2}-\d{2}$/);
});

test("formatRelativeTime returns em-dash for null/undefined", () => {
  assert.equal(formatRelativeTime(null), "-");
  assert.equal(formatRelativeTime(undefined), "-");
});
