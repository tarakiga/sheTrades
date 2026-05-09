import test from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { createApp } from "../app.js";
import { resetLearningEngineState } from "../learning/engine.js";

const app = createApp();

test("GET /api/users/:phone returns default user learning state", async () => {
  resetLearningEngineState();
  const response = await request(app).get("/api/users/+234800000101").expect(200);

  assert.equal(response.body.phone, "+234800000101");
  assert.deepEqual(response.body.progress, {});
  assert.deepEqual(response.body.modules, {});
  assert.ok(Array.isArray(response.body.rewards));
});

test("POST /api/progress applies lesson completion in sequence", async () => {
  resetLearningEngineState();
  const response = await request(app)
    .post("/api/progress")
    .send({
      phone: "+234800000102",
      updateId: "u-1",
      event: {
        type: "lesson_completed",
        moduleId: 1,
        lessonId: 1
      }
    })
    .expect(200);

  assert.equal(response.body.status, "applied");
  assert.equal(response.body.state.progress.module1, 23);
  assert.deepEqual(response.body.state.modules.module1.completedLessons, [1]);
});

test("POST /api/progress rejects out-of-order lesson transitions", async () => {
  resetLearningEngineState();
  const response = await request(app)
    .post("/api/progress")
    .send({
      phone: "+234800000103",
      updateId: "u-2",
      event: {
        type: "lesson_completed",
        moduleId: 1,
        lessonId: 2
      }
    })
    .expect(200);

  assert.equal(response.body.status, "no_op");
  assert.match(String(response.body.reason), /Invalid lesson sequence/i);
  assert.equal(response.body.state.progress.module1, 0);
});

test("POST /api/progress enforces quiz submission only after lessons are complete", async () => {
  resetLearningEngineState();
  const response = await request(app)
    .post("/api/progress")
    .send({
      phone: "+234800000104",
      updateId: "u-3",
      event: {
        type: "quiz_submitted",
        moduleId: 1,
        selectedAnswers: [1, 2, 3],
        answerKey: [1, 2, 3]
      }
    })
    .expect(200);

  assert.equal(response.body.status, "no_op");
  assert.match(
    String(response.body.reason),
    /Cannot submit quiz before all lessons are completed/i
  );
});

test("POST /api/progress applies quiz scoring and module completion", async () => {
  resetLearningEngineState();
  const phone = "+234800000105";

  await request(app)
    .post("/api/progress")
    .send({
      phone,
      updateId: "u-4-1",
      event: { type: "lesson_completed", moduleId: 1, lessonId: 1 }
    })
    .expect(200);
  await request(app)
    .post("/api/progress")
    .send({
      phone,
      updateId: "u-4-2",
      event: { type: "lesson_completed", moduleId: 1, lessonId: 2 }
    })
    .expect(200);
  await request(app)
    .post("/api/progress")
    .send({
      phone,
      updateId: "u-4-3",
      event: { type: "lesson_completed", moduleId: 1, lessonId: 3 }
    })
    .expect(200);

  const quizResponse = await request(app)
    .post("/api/progress")
    .send({
      phone,
      updateId: "u-4-4",
      event: {
        type: "quiz_submitted",
        moduleId: 1,
        selectedAnswers: [1, 2, 3, 0],
        answerKey: [1, 2, 3, 1]
      }
    })
    .expect(200);

  assert.equal(quizResponse.body.status, "applied");
  assert.equal(quizResponse.body.state.modules.module1.latestQuizScore, 75);
  assert.equal(quizResponse.body.state.modules.module1.passed, true);
  assert.equal(quizResponse.body.state.progress.module1, 100);
  assert.equal(quizResponse.body.state.modules.module1.completed, true);
  assert.equal(quizResponse.body.state.rewards[0].module, 1);
});

test("POST /api/progress handles idempotent update ids", async () => {
  resetLearningEngineState();
  const payload = {
    phone: "+234800000106",
    updateId: "same-id",
    event: { type: "lesson_completed", moduleId: 1, lessonId: 1 }
  };

  const first = await request(app).post("/api/progress").send(payload).expect(200);
  const second = await request(app).post("/api/progress").send(payload).expect(200);

  assert.equal(first.body.status, "applied");
  assert.equal(second.body.status, "duplicate");
  assert.match(String(second.body.reason), /already processed/i);
});
