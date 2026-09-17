import test from "node:test";
import assert from "node:assert/strict";

import { summaryAmount, summaryCount } from "./rewards-summary.js";
import type { RewardsSummary } from "./contracts.js";

const summary: RewardsSummary = {
  byStatus: [
    { status: "Failed", count: 851, amount: 425500 },
    { status: "Issued", count: 7322, amount: 3661000 },
    { status: "Pending", count: 869, amount: 434500 }
  ],
  total: { count: 9042, amount: 4521000 }
};

test("a status that exists reads its count and amount", () => {
  assert.equal(summaryCount(summary, "Issued"), 7322);
  assert.equal(summaryAmount(summary, "Issued"), 3661000);
});

test("a status with no rows is 0, not undefined", () => {
  assert.equal(summaryCount(summary, "RetryQueued"), 0);
  assert.equal(summaryAmount(summary, "RetryQueued"), 0);
});

test("no summary at all (older backend) is 0 so a caller can fall back to its page", () => {
  assert.equal(summaryCount(undefined, "Issued"), 0);
  assert.equal(summaryAmount(undefined, "Issued"), 0);
});
