import test from "node:test";
import assert from "node:assert/strict";
import { countCompletedModules, milestoneRewardKey, resolveMilestoneAwards } from "./milestones.js";
import { rewardRulesPayloadSchema } from "../config-platform/contracts.js";

// The client's actual plan: ₦500 at two modules, ₦500 when everything is done.
const CLIENT_PLAN = [
  { modulesCompleted: 2 as const, amount: 500 },
  { modulesCompleted: "all" as const, amount: 500 }
];

test("below the first milestone: no awards", () => {
  assert.deepEqual(resolveMilestoneAwards(CLIENT_PLAN, 1, 5), []);
});

test("crossing two modules earns exactly the first milestone", () => {
  assert.deepEqual(resolveMilestoneAwards(CLIENT_PLAN, 2, 5), [
    { key: "Milestone: 2 modules", amount: 500 }
  ]);
});

test("catch-up: a learner already past a milestone still earns it (>= semantics)", () => {
  assert.deepEqual(resolveMilestoneAwards(CLIENT_PLAN, 3, 5), [
    { key: "Milestone: 2 modules", amount: 500 }
  ]);
});

test("completing every module earns both milestones", () => {
  assert.deepEqual(resolveMilestoneAwards(CLIENT_PLAN, 5, 5), [
    { key: "Milestone: 2 modules", amount: 500 },
    { key: "Milestone: all modules", amount: 500 }
  ]);
});

test("'all' resolves against the CURRENT module count (adding a module moves the finish line)", () => {
  // With 6 published modules, 5 completed no longer earns the final milestone.
  assert.deepEqual(resolveMilestoneAwards(CLIENT_PLAN, 5, 6), [
    { key: "Milestone: 2 modules", amount: 500 }
  ]);
});

test("milestone reward key is threshold-derived and ignores labels", () => {
  assert.equal(milestoneRewardKey(2, 5), "Milestone: 2 modules");
  assert.equal(milestoneRewardKey("all", 5), "Milestone: all modules");
  // Same spelling regardless of total for numeric thresholds.
  assert.equal(milestoneRewardKey(2, 9), "Milestone: 2 modules");
});

test("duplicate thresholds in config collapse to a single award", () => {
  const sloppy = [
    { modulesCompleted: 2 as const, amount: 500 },
    { modulesCompleted: 2 as const, amount: 750 }
  ];
  assert.deepEqual(resolveMilestoneAwards(sloppy, 2, 5), [
    { key: "Milestone: 2 modules", amount: 500 }
  ]);
});

test("countCompletedModules counts only fully-finished modules", () => {
  const lessons = [
    { key: "m1_l1", module: "Module 1" },
    { key: "m1_l2", module: "Module 1" },
    { key: "m2_l1", module: "Module 2" },
    { key: "m3_l1", module: "Module 3" }
  ];
  const result = countCompletedModules(["m1_l1", "m1_l2", "m2_l1", "m3_l1"], lessons);
  assert.deepEqual(result, { completedModules: 3, totalModules: 3 });

  const partial = countCompletedModules(["m1_l1", "m2_l1"], lessons);
  assert.deepEqual(partial, { completedModules: 1, totalModules: 3 });
});

test("a module with zero lessons neither counts as completed nor inflates totals incorrectly", () => {
  const lessons = [{ key: "m1_l1", module: "Module 1" }];
  const result = countCompletedModules(["m1_l1"], lessons);
  assert.deepEqual(result, { completedModules: 1, totalModules: 1 });
});

test("reward rules schema accepts the client plan and rejects malformed milestones", () => {
  const valid = rewardRulesPayloadSchema.safeParse({
    kind: "reward_rules",
    amount: 200,
    channel: "airtime",
    enabled: true,
    milestones: [
      { modulesCompleted: 2, amount: 500, label: "First two modules" },
      { modulesCompleted: "all", amount: 500, label: "Programme complete" }
    ]
  });
  assert.ok(valid.success);

  // Legacy flat rule (no milestones) stays valid.
  assert.ok(
    rewardRulesPayloadSchema.safeParse({
      kind: "reward_rules", amount: 200, channel: "airtime", enabled: true
    }).success
  );

  assert.equal(
    rewardRulesPayloadSchema.safeParse({
      kind: "reward_rules", amount: 200, channel: "airtime", enabled: true,
      milestones: [{ modulesCompleted: 0, amount: 500 }]
    }).success,
    false
  );
  assert.equal(
    rewardRulesPayloadSchema.safeParse({
      kind: "reward_rules", amount: 200, channel: "airtime", enabled: true,
      milestones: [{ modulesCompleted: "some", amount: 500 }]
    }).success,
    false
  );
});
