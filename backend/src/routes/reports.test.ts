import test from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { createApp } from "../app.js";
import { resetReportExportState } from "../reports/export-service.js";

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
      schemaVersion: "v1",
      requestedBy: "admin@shetrades.org"
    })
    .expect(201);

  assert.equal(response.body.status, "created");
  assert.equal(response.body.job.status, "Ready");
  assert.match(String(response.body.job.content), /totalDonors/);
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
          schemaVersion: "v1",
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
      schemaVersion: "v1",
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
