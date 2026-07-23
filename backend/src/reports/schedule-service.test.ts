import test from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { createApp } from "../app.js";
import {
  buildScheduledReportEmail,
  cadenceSchema,
  computeNextRunAt,
  createScheduleInputSchema,
  resolveCadenceOption,
  type Cadence
} from "./schedule-service.js";

// ---- computeNextRunAt ----

test("daily cadence: same day when the hour is still ahead, next day otherwise", () => {
  const cadence: Cadence = { kind: "daily", hourUtc: 8 };
  const beforeHour = new Date("2026-07-23T05:00:00.000Z");
  assert.equal(computeNextRunAt(cadence, beforeHour).toISOString(), "2026-07-23T08:00:00.000Z");

  const afterHour = new Date("2026-07-23T09:00:00.000Z");
  assert.equal(computeNextRunAt(cadence, afterHour).toISOString(), "2026-07-24T08:00:00.000Z");

  // Exactly at the slot -> strictly after, so the NEXT day.
  const atHour = new Date("2026-07-23T08:00:00.000Z");
  assert.equal(computeNextRunAt(cadence, atHour).toISOString(), "2026-07-24T08:00:00.000Z");
});

test("weekly cadence lands on the requested weekday", () => {
  // 2026-07-23 is a Thursday; next Monday (weekday 1) is 2026-07-27.
  const cadence: Cadence = { kind: "weekly", weekdayUtc: 1, hourUtc: 8 };
  const thursday = new Date("2026-07-23T12:00:00.000Z");
  assert.equal(computeNextRunAt(cadence, thursday).toISOString(), "2026-07-27T08:00:00.000Z");

  // From a Monday after the hour, the run moves a full week out.
  const mondayLate = new Date("2026-07-27T10:00:00.000Z");
  assert.equal(computeNextRunAt(cadence, mondayLate).toISOString(), "2026-08-03T08:00:00.000Z");
});

test("monthly cadence rolls to the next month and clamps short months", () => {
  const firstOfMonth: Cadence = { kind: "monthly", dayOfMonthUtc: 1, hourUtc: 8 };
  const midJuly = new Date("2026-07-23T12:00:00.000Z");
  assert.equal(computeNextRunAt(firstOfMonth, midJuly).toISOString(), "2026-08-01T08:00:00.000Z");

  // Day 31 requested; from mid-January the next run is Jan 31, and from
  // Jan 31 after the hour it clamps to Feb 28 (2027 is not a leap year).
  const day31: Cadence = { kind: "monthly", dayOfMonthUtc: 31, hourUtc: 8 };
  const midJan = new Date("2027-01-15T00:00:00.000Z");
  assert.equal(computeNextRunAt(day31, midJan).toISOString(), "2027-01-31T08:00:00.000Z");
  const endJan = new Date("2027-01-31T09:00:00.000Z");
  assert.equal(computeNextRunAt(day31, endJan).toISOString(), "2027-02-28T08:00:00.000Z");
});

// ---- cadence metadata contract ----

test("cadenceSchema accepts the seeded shapes and rejects malformed metadata", () => {
  assert.ok(cadenceSchema.safeParse({ kind: "daily", hourUtc: 8 }).success);
  assert.ok(cadenceSchema.safeParse({ kind: "weekly", weekdayUtc: 1, hourUtc: 8 }).success);
  assert.ok(cadenceSchema.safeParse({ kind: "monthly", dayOfMonthUtc: 1, hourUtc: 8 }).success);
  assert.equal(cadenceSchema.safeParse({ kind: "weekly", hourUtc: 8 }).success, false);
  assert.equal(cadenceSchema.safeParse({ kind: "daily", hourUtc: 24 }).success, false);
  assert.equal(cadenceSchema.safeParse({ kind: "hourly", hourUtc: 1 }).success, false);
});

test("resolveCadenceOption falls back to built-in cadences when config is empty", () => {
  const weekly = resolveCadenceOption("weekly_mon_0800utc");
  assert.ok(weekly);
  assert.equal(weekly.cadence.kind, "weekly");
  assert.equal(resolveCadenceOption("no_such_cadence"), null);
});

// ---- input contract ----

test("createScheduleInputSchema normalises and validates recipients", () => {
  const parsed = createScheduleInputSchema.parse({
    presetId: "donor",
    cadenceKey: "weekly_mon_0800utc",
    recipients: [{ email: "  Partner@Example.ORG ", label: "M&E lead" }]
  });
  assert.equal(parsed.recipients[0]?.email, "partner@example.org");

  assert.throws(() =>
    createScheduleInputSchema.parse({
      presetId: "donor",
      cadenceKey: "weekly_mon_0800utc",
      recipients: []
    })
  );
  assert.throws(() =>
    createScheduleInputSchema.parse({
      presetId: "donor",
      cadenceKey: "weekly_mon_0800utc",
      recipients: [{ email: "not-an-email" }]
    })
  );
});

// ---- email template ----

test("buildScheduledReportEmail fills every placeholder from context", () => {
  const email = buildScheduledReportEmail({
    reportLabel: "Partner",
    cadenceLabel: "Weekly on Mondays at 09:00 (WAT)",
    fileName: "donor_summary-2026-07-23.csv",
    period: "up to 2026-07-23"
  });
  assert.ok(email.subject.includes("Partner"));
  assert.ok(email.subject.includes("up to 2026-07-23"));
  assert.ok(email.text.includes("donor_summary-2026-07-23.csv"));
  assert.ok(email.text.includes("Weekly on Mondays at 09:00 (WAT)"));
  assert.equal(email.subject.includes("{{"), false);
  assert.equal(email.text.includes("{{"), false);
});

// ---- worker route guard ----

test("dispatch endpoint rejects a missing or wrong worker token", async () => {
  const app = createApp();
  const previous = {
    reports: process.env.REPORTS_WORKER_TOKEN,
    payouts: process.env.PAYOUTS_WORKER_TOKEN
  };
  process.env.REPORTS_WORKER_TOKEN = "expected";
  delete process.env.PAYOUTS_WORKER_TOKEN;
  try {
    await request(app).post("/internal/reports/schedules/dispatch").expect(403);
    await request(app)
      .post("/internal/reports/schedules/dispatch")
      .set("X-Internal-Worker-Token", "wrong")
      .expect(403);
  } finally {
    if (previous.reports === undefined) delete process.env.REPORTS_WORKER_TOKEN;
    else process.env.REPORTS_WORKER_TOKEN = previous.reports;
    if (previous.payouts !== undefined) process.env.PAYOUTS_WORKER_TOKEN = previous.payouts;
  }
});

test("dispatch endpoint refuses everything when no worker token is configured", async () => {
  const app = createApp();
  const previous = {
    reports: process.env.REPORTS_WORKER_TOKEN,
    payouts: process.env.PAYOUTS_WORKER_TOKEN
  };
  delete process.env.REPORTS_WORKER_TOKEN;
  delete process.env.PAYOUTS_WORKER_TOKEN;
  try {
    await request(app)
      .post("/internal/reports/schedules/dispatch")
      .set("X-Internal-Worker-Token", "anything")
      .expect(403);
  } finally {
    if (previous.reports !== undefined) process.env.REPORTS_WORKER_TOKEN = previous.reports;
    if (previous.payouts !== undefined) process.env.PAYOUTS_WORKER_TOKEN = previous.payouts;
  }
});
