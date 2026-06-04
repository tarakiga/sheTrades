import test from "node:test";
import assert from "node:assert/strict";
import { prisma } from "./prisma.js";
import { getLearnerDetail } from "./users-detail.js";

test("getLearnerDetail returns null for an unknown phone", async () => {
  const result = await getLearnerDetail("+234000000nope");
  assert.equal(result, null);
});

test("getLearnerDetail aggregates identity, session, progress, quiz, rewards", async () => {
  const phone = `+234${Date.now()}`.slice(0, 14);
  const user = await prisma.user.create({
    data: {
      phone,
      name: "Detail Test",
      location: "Anambra",
      language: "en",
      status: "Active",
      session: { create: { state: "module_menu", completedLessons: ["content.lesson.m1_l1"], currentLessonKey: "content.lesson.m1_l2" } },
      progress: { create: { module: "Module 1", completionPercentage: 50 } },
      quizAttempts: { create: { lessonKey: "content.lesson.m1_l1", passed: true, attemptCount: 2 } },
      rewards: { create: { module: "Module 1", amount: 500, channel: "airtime", status: "Pending", learnerPhone: phone } }
    }
  });

  const detail = await getLearnerDetail(phone);
  assert.ok(detail);
  assert.equal(detail!.identity.phone, phone);
  assert.equal(detail!.identity.name, "Detail Test");
  assert.equal(detail!.identity.flaggedForFollowUp, false);
  assert.equal(detail!.session?.state, "module_menu");
  assert.deepEqual(detail!.session?.completedLessons, ["content.lesson.m1_l1"]);
  assert.equal(detail!.progress[0]!.module, "Module 1");
  assert.equal(detail!.progress[0]!.completionPercentage, 50);
  assert.equal(detail!.quizAttempts[0]!.passed, true);
  assert.equal(detail!.rewards[0]!.amount, 500);
  assert.equal(typeof detail!.identity.createdAt, "string");

  await prisma.user.delete({ where: { id: user.id } });
});
