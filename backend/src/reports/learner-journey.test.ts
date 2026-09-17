import test from "node:test";
import assert from "node:assert/strict";
import {
  JOURNEY_COLUMNS,
  ME_PARTICIPANT_COLUMNS,
  courseStatus,
  daysBetween,
  moduleStatus,
  participantRow,
  expandJourneyColumns,
  formatWat,
  journeyRow,
  learnerRef,
  median,
  moduleStem,
  sortModuleKeys,
  watMonth
} from "./learner-journey.js";

test("formatWat shifts UTC by one hour and drops seconds", () => {
  assert.equal(formatWat(new Date("2026-09-16T15:04:59.999Z")), "2026-09-16 16:04");
  assert.equal(formatWat("2026-09-16T23:30:00.000Z"), "2026-09-17 00:30", "a late UTC evening is the next WAT morning");
  assert.equal(formatWat(null), "");
  assert.equal(formatWat("not a date"), "");
});

test("watMonth assigns a moment to its West Africa Time month", () => {
  assert.equal(watMonth("2026-09-30T23:30:00.000Z"), "2026-10", "half past eleven UTC on the 30th is October in Lagos");
  assert.equal(watMonth("2026-09-15T12:00:00.000Z"), "2026-09");
  assert.equal(watMonth(undefined), "");
});

test("learnerRef is stable, pseudonymous and readable", () => {
  const a = learnerRef("0f1e2d3c-4b5a-6978-8a9b-0c1d2e3f4a5b");
  assert.equal(a, learnerRef("0f1e2d3c-4b5a-6978-8a9b-0c1d2e3f4a5b"), "same learner, same ref, every report");
  assert.match(a, /^L-[0-9A-F]{10}$/);
  assert.notEqual(a, learnerRef("0f1e2d3c-4b5a-6978-8a9b-0c1d2e3f4a5c"));
  assert.ok(!a.includes("0f1e2d3c"), "the id itself never appears");
});

test("daysBetween is one decimal, null when missing or reversed", () => {
  assert.equal(daysBetween("2026-01-01T10:00:00Z", "2026-01-03T10:00:00Z"), 2);
  assert.equal(daysBetween("2026-01-01T10:00:00Z", "2026-01-01T22:00:00Z"), 0.5);
  assert.equal(daysBetween("2026-01-01T10:00:00Z", "2026-01-04T18:36:00Z"), 3.4);
  assert.equal(daysBetween(null, "2026-01-03T10:00:00Z"), null);
  assert.equal(daysBetween("2026-01-03T10:00:00Z", "2026-01-01T10:00:00Z"), null);
});

test("median handles odd, even and empty", () => {
  assert.equal(median([5, 1, 3]), 3);
  assert.equal(median([1, 2, 3, 4]), 2.5);
  assert.equal(median([2.26]), 2.3);
  assert.equal(median([]), null);
});

test("moduleStem normalises however a module was named", () => {
  assert.equal(moduleStem("module1"), "module1");
  assert.equal(moduleStem("Module 3"), "module3");
  assert.equal(moduleStem("Module 05: Selling online"), "module5");
  assert.equal(moduleStem("Bonus: Payments"), "bonus_payments");
});

test("sortModuleKeys is curriculum order, unique, unnumbered last", () => {
  assert.deepEqual(sortModuleKeys(["module10", "Module 2", "module1", "module1", "Extras"]), [
    "module1",
    "Module 2",
    "module10",
    "Extras"
  ]);
});

test("expandJourneyColumns replaces the placeholders with a pair per module, in place", () => {
  const columns = expandJourneyColumns(JOURNEY_COLUMNS, ["module1", "Module 2"]);
  assert.deepEqual(columns, [
    "learnerRef",
    "state",
    "language",
    "firstContactAtWAT",
    "enrolledAtWAT",
    "module1StartedAtWAT",
    "module1CompletedAtWAT",
    "module2StartedAtWAT",
    "module2CompletedAtWAT",
    "modulesCompleted",
    "courseCompletedAtWAT",
    "daysToComplete",
    "lastActiveAtWAT",
    "certificateId",
    "rewardsIssuedNgn"
  ]);
  assert.ok(!columns.some((c) => c.includes("{n}")));
});

test("expandJourneyColumns with no modules simply drops the placeholders", () => {
  assert.deepEqual(expandJourneyColumns(["a", "module{n}X", "b"], []), ["a", "b"]);
});

test("journeyRow lines up with the expanded columns and formats every field", () => {
  const modules = ["module1", "module2"];
  const row = journeyRow(
    {
      id: "user-1",
      location: "Lagos",
      language: "pcm",
      firstContactAt: "2026-01-01T09:30:00Z",
      enrolledAt: "2026-01-01T10:00:00Z",
      lastActiveAt: "2026-01-03T12:00:00Z",
      certificateId: "abcdefghijklmnopqrstuvwxyz123456",
      courseCompletedAt: "2026-01-03T10:00:00Z",
      rewardsIssuedNgn: "1000",
      modules: [
        { module: "Module 2", startedAt: "2026-01-02T08:00:00Z", completedAt: "2026-01-03T10:00:00Z" },
        { module: "module1", startedAt: null, completedAt: "2026-01-02T07:00:00Z" }
      ]
    },
    modules
  );
  const columns = expandJourneyColumns(JOURNEY_COLUMNS, modules);
  assert.equal(row.length, columns.length);
  const cell = (name: string) => row[columns.indexOf(name)];
  assert.equal(cell("learnerRef"), learnerRef("user-1"));
  assert.equal(cell("state"), "Lagos");
  assert.equal(cell("enrolledAtWAT"), "2026-01-01 11:00");
  assert.equal(cell("module1StartedAtWAT"), "", "history predates startedAt: blank, not a guess");
  assert.equal(cell("module1CompletedAtWAT"), "2026-01-02 08:00");
  assert.equal(cell("module2StartedAtWAT"), "2026-01-02 09:00");
  assert.equal(cell("module2CompletedAtWAT"), "2026-01-03 11:00");
  assert.equal(cell("modulesCompleted"), "2");
  assert.equal(cell("courseCompletedAtWAT"), "2026-01-03 11:00");
  assert.equal(cell("daysToComplete"), "2.0");
  assert.equal(cell("lastActiveAtWAT"), "2026-01-03 13:00");
  assert.equal(cell("certificateId"), "abcdefghijklmnopqrstuvwxyz123456");
  assert.equal(cell("rewardsIssuedNgn"), "1000");
});

test("journeyRow for a learner who only said hello is mostly blank, never null", () => {
  const row = journeyRow(
    {
      id: "user-2",
      location: null,
      language: null,
      firstContactAt: "2026-01-01T09:30:00Z",
      enrolledAt: null,
      lastActiveAt: null,
      certificateId: null,
      courseCompletedAt: null,
      rewardsIssuedNgn: null,
      modules: []
    },
    ["module1"]
  );
  assert.deepEqual(row, [learnerRef("user-2"), "", "", "2026-01-01 10:30", "", "", "", "0", "", "", "", "", "0"]);
});

test("moduleStatus tells not started, in progress and completed apart", () => {
  assert.equal(moduleStatus(undefined), "Not started");
  assert.equal(moduleStatus({ module: "module1", startedAt: null, completedAt: null, pct: 0 }), "Not started");
  assert.equal(moduleStatus({ module: "module1", startedAt: null, completedAt: null, pct: 40 }), "In progress");
  assert.equal(moduleStatus({ module: "module1", startedAt: "2026-01-01T00:00:00Z", completedAt: null }), "In progress", "a recorded start counts even before any percentage");
  assert.equal(moduleStatus({ module: "module1", startedAt: null, completedAt: "2026-01-02T00:00:00Z" }), "Completed");
  assert.equal(moduleStatus({ module: "module1", startedAt: null, completedAt: null, pct: 100 }), "Completed");
});

test("courseStatus walks the funnel: registered, enrolled, in progress, completed", () => {
  const base = { id: "u", location: null, language: null, firstContactAt: "2026-01-01T09:00:00Z", enrolledAt: null, lastActiveAt: null, certificateId: null, courseCompletedAt: null, rewardsIssuedNgn: null, modules: [] };
  assert.equal(courseStatus(base), "Registered");
  assert.equal(courseStatus({ ...base, enrolledAt: "2026-01-01T10:00:00Z" }), "Enrolled");
  assert.equal(courseStatus({ ...base, enrolledAt: "2026-01-01T10:00:00Z", modules: [{ module: "module1", startedAt: null, completedAt: null, pct: 20 }] }), "In progress");
  assert.equal(courseStatus({ ...base, enrolledAt: "2026-01-01T10:00:00Z", courseCompletedAt: "2026-01-03T10:00:00Z" }), "Completed");
});

test("participantRow carries name, phone, a status per module and the course status, aligned with its columns", () => {
  const modules = ["module1", "module2"];
  const input = {
    id: "user-1",
    name: "Amaka Obi",
    phone: "+234800000001",
    location: "Lagos",
    language: "pcm",
    firstContactAt: "2026-01-01T09:30:00Z",
    enrolledAt: "2026-01-01T10:00:00Z",
    lastActiveAt: "2026-01-03T12:00:00Z",
    certificateId: null,
    courseCompletedAt: null,
    rewardsIssuedNgn: 500,
    modules: [
      { module: "module1", startedAt: "2026-01-01T11:00:00Z", completedAt: "2026-01-02T07:00:00Z", pct: 100 },
      { module: "module2", startedAt: "2026-01-02T08:00:00Z", completedAt: null, pct: 40 }
    ]
  };
  const columns = expandJourneyColumns(ME_PARTICIPANT_COLUMNS, modules);
  const row = participantRow(input, modules);
  assert.equal(row.length, columns.length);
  const cell = (name: string) => row[columns.indexOf(name)];
  assert.equal(cell("learnerRef"), learnerRef("user-1"), "the same ref as the donor report, so the two can be joined");
  assert.equal(cell("name"), "Amaka Obi");
  assert.equal(cell("phone"), "+234800000001");
  assert.equal(cell("module1Status"), "Completed");
  assert.equal(cell("module2Status"), "In progress");
  assert.equal(cell("module2StartedAtWAT"), "2026-01-02 09:00");
  assert.equal(cell("module2CompletedAtWAT"), "");
  assert.equal(cell("modulesCompleted"), "1");
  assert.equal(cell("courseStatus"), "In progress");
  assert.equal(cell("courseCompletedAtWAT"), "");
  assert.equal(cell("daysToComplete"), "");

  // The donor variant of the same learner still carries neither name nor phone.
  const donor = journeyRow(input, modules);
  assert.ok(!donor.includes("Amaka Obi") && !donor.includes("+234800000001"));
  assert.equal(donor.length, expandJourneyColumns(JOURNEY_COLUMNS, modules).length);
});
