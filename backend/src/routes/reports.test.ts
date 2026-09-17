import test from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { createApp } from "../app.js";
import { resetReportExportState } from "../reports/export-service.js";
import { prisma } from "../admin/prisma.js";
import { learnerRef } from "../reports/learner-journey.js";

// authorizeReportsAccess no longer ships a hardcoded fallback token, so the
// suite configures the expected secret explicitly (read per-request).
process.env.ADMIN_REPORTS_API_TOKEN =
  process.env.ADMIN_REPORTS_API_TOKEN ?? "local-dev-reports-token";

const app = createApp();

const authHeaders = {
  "x-admin-role": "admin",
  "x-admin-token": process.env.ADMIN_REPORTS_API_TOKEN
};

async function withEnv(
  env: Record<string, string | undefined>,
  fn: () => Promise<void> | void
): Promise<void> {
  const previous: Record<string, string | undefined> = {};
  for (const key of Object.keys(env)) {
    previous[key] = process.env[key];
    if (env[key] === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = env[key];
    }
  }
  try {
    await fn();
  } finally {
    for (const key of Object.keys(env)) {
      if (previous[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = previous[key];
      }
    }
  }
}

test("GET /api/reports/schemas enforces access control", async () => {
  resetReportExportState();
  await request(app).get("/api/reports/schemas").expect(403);
});

test("GET /api/reports/schemas returns schema registry for authorized admin", async () => {
  resetReportExportState();
  const response = await request(app).get("/api/reports/schemas").set(authHeaders).expect(200);
  assert.ok(Array.isArray(response.body.schemas));
  assert.ok(
    response.body.schemas.some((row: { reportType?: string }) => row.reportType === "donor_summary")
  );
});

test("POST /api/reports/exports creates CSV export job with schema governance", async () => {
  resetReportExportState();
  const response = await request(app)
    .post("/api/reports/exports")
    .set(authHeaders)
    .send({
      requestId: "rep-1",
      reportType: "donor_summary",
      format: "csv",
      schemaVersion: "v3",
      requestedBy: "admin@shetrades.org"
    })
    .expect(201);

  assert.equal(response.body.status, "created");
  assert.equal(response.body.job.status, "Ready");
  assert.match(String(response.body.job.content), /"period","recipients","rewardsIssued","totalNgnIssued","learnersEnrolled","learnersCompleted","medianDaysToComplete"/);
});

test("POST /api/reports/exports is idempotent by requestId", async () => {
  resetReportExportState();
  const payload = {
    requestId: "rep-2",
    reportType: "module_completion_detail",
    format: "pdf",
    schemaVersion: "v1",
    requestedBy: "ops@shetrades.org"
  };

  const first = await request(app)
    .post("/api/reports/exports")
    .set(authHeaders)
    .send(payload)
    .expect(201);
  const second = await request(app)
    .post("/api/reports/exports")
    .set(authHeaders)
    .send(payload)
    .expect(200);

  assert.equal(first.body.status, "created");
  assert.equal(second.body.status, "duplicate");
  assert.equal(second.body.job.requestId, "rep-2");
});

test("POST /api/reports/exports rejects schema mismatch", async () => {
  resetReportExportState();
  const response = await request(app)
    .post("/api/reports/exports")
    .set(authHeaders)
    .send({
      requestId: "rep-3",
      reportType: "rewards_issuance_log",
      format: "csv",
      schemaVersion: "v2",
      requestedBy: "ops@shetrades.org"
    })
    .expect(409);

  assert.match(String(response.body.message), /Schema mismatch/);
});

test("POST /api/reports/exports returns 502 when renderer fails repeatedly", async () => {
  resetReportExportState();
  await withEnv(
    { REPORT_EXPORT_RENDER_MODE: "always_fail", REPORT_EXPORT_RETRY_ATTEMPTS: "2" },
    async () => {
      const response = await request(app)
        .post("/api/reports/exports")
        .set(authHeaders)
        .send({
          requestId: "rep-4",
          reportType: "donor_summary",
          format: "csv",
          schemaVersion: "v3",
          requestedBy: "admin@shetrades.org"
        })
        .expect(502);

      assert.equal(response.body.status, "failed");
      assert.equal(response.body.job.status, "Failed");
    }
  );
});

test("POST /api/reports/exports retries transient failures and succeeds", async () => {
  resetReportExportState();
  await withEnv(
    {
      REPORT_EXPORT_RENDER_MODE: "flaky_once",
      REPORT_EXPORT_RETRY_ATTEMPTS: "3",
      REPORT_EXPORT_RETRY_DELAY_MS: "1"
    },
    async () => {
      const response = await request(app)
        .post("/api/reports/exports")
        .set(authHeaders)
        .send({
          requestId: "rep-5",
          reportType: "module_completion_detail",
          format: "pdf",
          schemaVersion: "v1",
          requestedBy: "ops@shetrades.org"
        })
        .expect(201);

      assert.equal(response.body.status, "created");
      assert.equal(response.body.job.status, "Ready");
      assert.match(String(response.body.job.content), /PDF_REPORT/);
    }
  );
});

test("GET /api/reports/exports and /api/reports/exports/:id return export artifacts", async () => {
  resetReportExportState();
  const create = await request(app)
    .post("/api/reports/exports")
    .set(authHeaders)
    .send({
      requestId: "rep-6",
      reportType: "donor_summary",
      format: "csv",
      schemaVersion: "v3",
      requestedBy: "admin@shetrades.org"
    })
    .expect(201);

  const list = await request(app).get("/api/reports/exports").set(authHeaders).expect(200);
  assert.ok(Array.isArray(list.body.exports));
  assert.ok(list.body.exports.some((job: { requestId?: string }) => job.requestId === "rep-6"));

  const detail = await request(app)
    .get(`/api/reports/exports/${create.body.job.exportId}`)
    .set(authHeaders)
    .expect(200);
  assert.equal(detail.body.job.requestId, "rep-6");
});

// --- Learner journey (2026-09-17) ---------------------------------------------

test("GET /api/reports/schemas lists the learner journey with its per-module placeholders", async () => {
  const response = await request(app).get("/api/reports/schemas").set(authHeaders).expect(200);
  const journey = response.body.schemas.find((row: { reportType?: string }) => row.reportType === "learner_journey");
  assert.ok(journey, "learner_journey must be offered");
  assert.equal(journey.schemaVersion, "v1");
  assert.ok(journey.columns.includes("module{n}StartedAtWAT"));
  assert.ok(journey.columns.includes("enrolledAtWAT"));
});

test("POST /api/reports/exports learner_journey (mock) expands the module columns and carries no placeholder", async () => {
  await withEnv({ REPORT_EXPORT_RENDER_MODE: "mock" }, async () => {
    const response = await request(app)
      .post("/api/reports/exports")
      .set(authHeaders)
      .send({ requestId: "req-journey-mock", reportType: "learner_journey", format: "csv", schemaVersion: "v1", requestedBy: "test" })
      .expect(201);
    const header = String(response.body.job.content).split("\n")[0] ?? "";
    assert.ok(header.includes('"module1StartedAtWAT","module1CompletedAtWAT","module2StartedAtWAT","module2CompletedAtWAT"'));
    assert.ok(!header.includes("{n}"));
    assert.match(header, /^"learnerRef","state","language","firstContactAtWAT","enrolledAtWAT"/);
  });
});

test(
  "POST /api/reports/exports learner_journey reads a seeded learner end to end, in West Africa Time",
  { concurrency: false, skip: process.env.POSTGRES_URL ? false : "requires POSTGRES_URL" },
  async () => {
    const phone = "+234700000921";
    await prisma.user.deleteMany({ where: { phone } });
    const user = await prisma.user.create({
      data: {
        phone,
        name: "Journey Seed",
        location: "Enugu",
        language: "ig",
        createdAt: new Date("2026-01-01T09:30:00.000Z"),
        consentDecidedAt: new Date("2026-01-01T10:00:00.000Z")
      }
    });
    try {
      await prisma.userProgress.createMany({
        data: [
          { userId: user.id, module: "module1", completionPercentage: 100, startedAt: new Date("2026-01-01T11:00:00.000Z"), updatedAt: new Date("2026-01-02T07:00:00.000Z") },
          { userId: user.id, module: "module2", completionPercentage: 40, startedAt: new Date("2026-01-02T08:00:00.000Z"), updatedAt: new Date("2026-01-02T09:00:00.000Z") }
        ]
      });
      await prisma.certificate.create({
        data: {
          publicId: "journeyseedcertificate0000000001",
          userId: user.id,
          learnerName: "Journey Seed",
          programmeName: "SheTrades Digital",
          modulesCompleted: 5,
          totalModules: 5,
          issuedAt: new Date("2026-01-03T10:00:00.000Z"),
          templateKey: "certificate.template.test",
          templateVersion: 1
        }
      });
      await prisma.reward.create({
        data: { userId: user.id, module: "Milestone: 2 modules", amount: 500, channel: "Airtime", status: "Issued", learnerPhone: phone, issuedAt: new Date("2026-01-02T12:00:00.000Z") }
      });

      const response = await request(app)
        .post("/api/reports/exports")
        .set(authHeaders)
        .send({ requestId: `req-journey-db-${Date.now()}`, reportType: "learner_journey", format: "csv", schemaVersion: "v1", requestedBy: "test" })
        .expect(201);
      const lines = String(response.body.job.content).split("\n");
      const parse = (line: string) => line.split(",").map((c) => c.replace(/^"|"$/g, ""));
      const columns = parse(lines[0] ?? "");
      const row = lines.slice(1).map(parse).find((cells) => cells[0] === learnerRef(user.id));
      assert.ok(row, "the seeded learner must appear under her pseudonymous ref");
      const cell = (name: string) => row[columns.indexOf(name)];
      assert.equal(cell("state"), "Enugu");
      assert.equal(cell("language"), "ig");
      assert.equal(cell("firstContactAtWAT"), "2026-01-01 10:30");
      assert.equal(cell("enrolledAtWAT"), "2026-01-01 11:00");
      assert.equal(cell("module1StartedAtWAT"), "2026-01-01 12:00");
      assert.equal(cell("module1CompletedAtWAT"), "2026-01-02 08:00");
      assert.equal(cell("module2StartedAtWAT"), "2026-01-02 09:00");
      assert.equal(cell("module2CompletedAtWAT"), "", "40% is not completed");
      assert.equal(cell("modulesCompleted"), "1");
      assert.equal(cell("courseCompletedAtWAT"), "2026-01-03 11:00");
      assert.equal(cell("daysToComplete"), "2.0");
      assert.equal(cell("certificateId"), "journeyseedcertificate0000000001");
      assert.equal(cell("rewardsIssuedNgn"), "500");
      assert.ok(!lines.some((l) => l.includes(phone)), "no phone number anywhere in a donor-facing file");
    } finally {
      await prisma.reward.deleteMany({ where: { userId: user.id } });
      await prisma.certificate.deleteMany({ where: { userId: user.id } });
      await prisma.userProgress.deleteMany({ where: { userId: user.id } });
      await prisma.userSession.deleteMany({ where: { userId: user.id } });
      await prisma.user.deleteMany({ where: { id: user.id } });
    }
  }
);
