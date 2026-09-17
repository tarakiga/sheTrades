import test from "node:test";
import assert from "node:assert/strict";
import { DONOR_SUMMARY_COLUMNS, buildDonorSummaryRows } from "./donor-summary.js";

test("a month's row carries disbursements, enrolments, completions and the median days", () => {
  const rows = buildDonorSummaryRows({
    rewards: [
      { userId: "u1", status: "Issued", amount: 500, issuedAt: "2026-09-10T10:00:00Z", createdAt: "2026-09-10T09:00:00Z" },
      { userId: "u1", status: "Issued", amount: 500, issuedAt: "2026-09-12T10:00:00Z", createdAt: "2026-09-12T09:00:00Z" },
      { userId: "u2", status: "Failed", amount: 500, issuedAt: null, createdAt: "2026-09-12T09:00:00Z" },
      { userId: "u3", status: "Pending", amount: 500, issuedAt: null, createdAt: "2026-09-13T09:00:00Z" }
    ],
    enrolments: ["2026-09-01T10:00:00Z", "2026-09-02T10:00:00Z", "2026-09-03T10:00:00Z"],
    completions: [
      { issuedAt: "2026-09-03T10:00:00Z", enrolledAt: "2026-09-01T10:00:00Z" },
      { issuedAt: "2026-09-06T10:00:00Z", enrolledAt: "2026-09-02T10:00:00Z" },
      { issuedAt: "2026-09-13T10:00:00Z", enrolledAt: null }
    ]
  });
  assert.deepEqual(rows, [["2026-09", "3", "2", "1000", "3", "3", "3.0"]]);
  assert.equal(rows[0]!.length, DONOR_SUMMARY_COLUMNS.length);
});

test("months are West Africa Time, so a late-UTC moment lands in the next month", () => {
  const rows = buildDonorSummaryRows({
    rewards: [{ userId: "u1", status: "Issued", amount: 500, issuedAt: "2026-09-30T23:30:00Z", createdAt: "2026-09-30T23:00:00Z" }],
    enrolments: ["2026-09-30T23:15:00Z"],
    completions: []
  });
  assert.deepEqual(rows, [["2026-10", "1", "1", "500", "1", "0", ""]]);
});

test("rows come newest month first, and months with only enrolments still appear", () => {
  const rows = buildDonorSummaryRows({
    rewards: [{ userId: "u1", status: "Issued", amount: 500, issuedAt: "2026-08-10T10:00:00Z", createdAt: "2026-08-10T09:00:00Z" }],
    enrolments: ["2026-09-01T10:00:00Z"],
    completions: []
  });
  assert.deepEqual(
    rows.map((r) => r[0]),
    ["2026-09", "2026-08"]
  );
  assert.deepEqual(rows[0], ["2026-09", "0", "0", "0", "1", "0", ""]);
});

test("nothing at all is no rows, not a crash", () => {
  assert.deepEqual(buildDonorSummaryRows({ rewards: [], enrolments: [], completions: [] }), []);
});
