import test from "node:test";
import assert from "node:assert/strict";
import { summarizeRewardStatusRows, summaryAmount, summaryCount } from "./rewards-summary.js";

test("group-by rows fold into per-status lines and a grand total", () => {
  const summary = summarizeRewardStatusRows([
    { status: "Issued", count: "7322", amount: "3661000" },
    { status: "Failed", count: 851, amount: 425500 },
    { status: "Pending", count: "869", amount: "434500.00" }
  ]);
  assert.deepEqual(summary.byStatus, [
    { status: "Failed", count: 851, amount: 425500 },
    { status: "Issued", count: 7322, amount: 3661000 },
    { status: "Pending", count: 869, amount: 434500 }
  ]);
  assert.deepEqual(summary.total, { count: 9042, amount: 4521000 });
});

test("an empty table is an empty summary, not an error", () => {
  assert.deepEqual(summarizeRewardStatusRows([]), { byStatus: [], total: { count: 0, amount: 0 } });
});

test("malformed rows contribute nothing rather than NaN", () => {
  const summary = summarizeRewardStatusRows([
    { status: "Issued", count: "many", amount: null },
    { status: null, count: 5, amount: 2500 },
    { status: "Pending", count: -3, amount: "x" }
  ]);
  assert.deepEqual(summary.byStatus, [
    { status: "Issued", count: 0, amount: 0 },
    { status: "Pending", count: 0, amount: 0 }
  ]);
  assert.deepEqual(summary.total, { count: 0, amount: 0 });
});

test("amounts are kept to two decimal places", () => {
  const summary = summarizeRewardStatusRows([{ status: "Issued", count: 3, amount: 0.1 + 0.2 }]);
  assert.equal(summary.byStatus[0]?.amount, 0.3);
  assert.equal(summary.total.amount, 0.3);
});

test("summaryCount and summaryAmount read one status and default to 0", () => {
  const summary = summarizeRewardStatusRows([{ status: "Issued", count: 2, amount: 1000 }]);
  assert.equal(summaryCount(summary, "Issued"), 2);
  assert.equal(summaryAmount(summary, "Issued"), 1000);
  assert.equal(summaryCount(summary, "Failed"), 0);
  assert.equal(summaryAmount(undefined, "Issued"), 0);
});
