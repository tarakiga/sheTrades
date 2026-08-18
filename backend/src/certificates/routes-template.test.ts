import test, { after } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import request from "supertest";
import sharp from "sharp";
import { signJwtHs256ForTests } from "../auth/jwt-rbac.js";
import { disconnectPrismaForTests } from "../admin/prisma.js";
import { CERTIFICATE_PREVIEW_SAMPLES } from "./preview-samples.js";
import { MAX_NAME_LENGTH } from "./core.js";
import {
  createCertificateTemplateRouter,
  referencedAssetKeys,
  type CertificateTemplateDeps
} from "./routes-template.js";
import { buildStarterTemplate } from "./template-starter.js";

process.env.ADMIN_CONFIG_JWT_SECRET = process.env.ADMIN_CONFIG_JWT_SECRET ?? "test-secret";
process.env.PUBLIC_BASE_URL = process.env.PUBLIC_BASE_URL ?? "https://example.test";

after(disconnectPrismaForTests);

const TEMPLATE = buildStarterTemplate({
  assetKey: "certificate-background-v1",
  width: 2048,
  height: 1450,
  programmeName: "SheTrades Digital Learning Programme",
  issuerName: "TechHer"
});

async function pngOf(width: number, height: number): Promise<Buffer> {
  return sharp({
    create: { width, height, channels: 3, background: { r: 250, g: 245, b: 235 } }
  })
    .png()
    .toBuffer();
}

function appWith(overrides: Partial<CertificateTemplateDeps> = {}) {
  const app = express();
  app.use(express.json({ limit: "2mb" }));
  app.use(
    "/api/admin",
    createCertificateTemplateRouter({
      assetExists: async () => true,
      assetSize: async () => ({ width: 2048, height: 1450 }),
      refreshCache: async () => {},
      ...overrides
    })
  );
  return app;
}

function token(role: "admin" | "editor" | "viewer") {
  const now = Math.floor(Date.now() / 1000);
  return signJwtHs256ForTests(
    { sub: "admin-1", role, iat: now, exp: now + 3600 },
    process.env.ADMIN_CONFIG_JWT_SECRET as string
  );
}

test("no template route answers an unauthenticated caller", async () => {
  const app = appWith();
  await request(app).get("/api/admin/certificates-template").expect(401);
  await request(app).get("/api/admin/certificates-template/draft").expect(401);
  await request(app).put("/api/admin/certificates-template/draft").send({ payload: TEMPLATE }).expect(401);
  await request(app).post("/api/admin/certificates-template/publish").send({ expectedDraftVersionId: "v" }).expect(401);
  await request(app).post("/api/admin/certificates-template/rollback").send({ targetVersionId: "v" }).expect(401);
  await request(app).post("/api/admin/certificates-template/preview").send({ payload: TEMPLATE }).expect(401);
  await request(app).get("/api/admin/certificates-template/samples").expect(401);
});

test("a viewer cannot author, preview, publish or roll back", async () => {
  // Preview is included deliberately: it runs a full sharp render, so leaving
  // it open to a read-only role would hand out an unmetered image pipeline.
  const app = appWith();
  const auth = `Bearer ${token("viewer")}`;
  await request(app).put("/api/admin/certificates-template/draft").set("Authorization", auth).send({ payload: TEMPLATE }).expect(403);
  await request(app).post("/api/admin/certificates-template/preview").set("Authorization", auth).send({ payload: TEMPLATE }).expect(403);
  await request(app).post("/api/admin/certificates-template/publish").set("Authorization", auth).send({ expectedDraftVersionId: "v" }).expect(403);
  await request(app).post("/api/admin/certificates-template/rollback").set("Authorization", auth).send({ targetVersionId: "v" }).expect(403);
});

test("an editor may author but not publish", async () => {
  // Mirrors the generic config platform: editors write drafts, admins decide
  // what goes live. A published template is what the next learner receives.
  const app = appWith();
  const auth = `Bearer ${token("editor")}`;
  await request(app).post("/api/admin/certificates-template/publish").set("Authorization", auth).send({ expectedDraftVersionId: "v" }).expect(403);
  await request(app).post("/api/admin/certificates-template/rollback").set("Authorization", auth).send({ targetVersionId: "v" }).expect(403);
  await request(app).post("/api/admin/certificates-template/enabled").set("Authorization", auth).send({ enabled: true }).expect(403);
});

test("a malformed draft is refused with the offending field named", async () => {
  const app = appWith();
  const broken = { ...TEMPLATE, fields: [{ ...TEMPLATE.fields[0], color: "not-a-colour" }] };
  const response = await request(app)
    .put("/api/admin/certificates-template/draft")
    .set("Authorization", `Bearer ${token("editor")}`)
    .send({ payload: broken });
  assert.equal(response.status, 400);
  assert.match(response.body.message, /color/, "the admin has to be told WHICH field");
});

test("a draft naming artwork that does not exist is refused before it is saved", async () => {
  // Otherwise the failure surfaces as a 500 on a learner's certificate, long
  // after whoever made the change has stopped looking.
  const app = appWith({ assetExists: async (key) => key !== "logo-missing-v1" });
  const withGhost = {
    ...TEMPLATE,
    fields: [
      ...TEMPLATE.fields,
      { id: "ghost", variable: "logo", assetKey: "logo-missing-v1", x: 0.1, y: 0.1, width: 0.1 }
    ]
  };
  const response = await request(app)
    .put("/api/admin/certificates-template/draft")
    .set("Authorization", `Bearer ${token("editor")}`)
    .send({ payload: withGhost });
  assert.equal(response.status, 400);
  assert.match(response.body.message, /logo-missing-v1/);
});

test("referencedAssetKeys collects the background and every image field", () => {
  const keys = referencedAssetKeys({
    ...TEMPLATE,
    fields: [
      ...TEMPLATE.fields,
      { id: "a", variable: "logo", assetKey: "logo-one-v1", x: 0.1, y: 0.1, width: 0.1, align: "left", opacity: 1 },
      { id: "b", variable: "logo", assetKey: "logo-two-v1", x: 0.2, y: 0.1, width: 0.1, align: "left", opacity: 1 }
    ]
  });
  assert.deepEqual(new Set(keys), new Set(["certificate-background-v1", "logo-one-v1", "logo-two-v1"]));
});

test("the preview renders the real pipeline and comes back downscaled", async () => {
  // The whole point of the endpoint: the editor positions boxes, and THIS is
  // what draws them, so what an admin approves is what a learner receives.
  let renderedWith: { learnerName: string; certificateId: string } | null = null;
  const app = appWith({
    renderPng: async (input) => {
      renderedWith = {
        learnerName: input.values.learnerName,
        certificateId: input.values.certificateId
      };
      return pngOf(2048, 1450);
    }
  });
  const response = await request(app)
    .post("/api/admin/certificates-template/preview")
    .set("Authorization", `Bearer ${token("editor")}`)
    .send({ payload: TEMPLATE, sampleId: "long" });

  assert.equal(response.status, 200);
  assert.equal(response.headers["content-type"], "image/png");
  assert.equal(response.headers["cache-control"], "no-store");
  const meta = await sharp(response.body).metadata();
  assert.equal(meta.width, 1400, "the render is resized down for transport, not re-laid-out");

  const used = renderedWith as { learnerName: string; certificateId: string } | null;
  assert.equal(used?.learnerName, "Oluwafunmilayo Adebayo-Ogundimu-Chukwuemeka Ifeoluwapo");
  // A seven-letter placeholder would let someone size this field against a
  // string a quarter of its real width.
  assert.equal(used?.certificateId.length, 32);
});

test("a preview smaller than the transport width is not enlarged", async () => {
  const app = appWith({ renderPng: async () => pngOf(800, 600) });
  const response = await request(app)
    .post("/api/admin/certificates-template/preview")
    .set("Authorization", `Bearer ${token("admin")}`)
    .send({ payload: TEMPLATE });
  assert.equal(response.status, 200);
  const meta = await sharp(response.body).metadata();
  assert.equal(meta.width, 800);
});

test("a render failure is reported to the admin in the renderer's own words", async () => {
  const app = appWith({
    renderPng: async () => {
      throw new Error("certificate asset not found: logo-care-v1 (field logo-care)");
    }
  });
  const response = await request(app)
    .post("/api/admin/certificates-template/preview")
    .set("Authorization", `Bearer ${token("editor")}`)
    .send({ payload: TEMPLATE });
  assert.equal(response.status, 400);
  assert.match(response.body.message, /logo-care-v1/);
});

test("an unknown sample id falls back rather than refusing to draw", async () => {
  let name = "";
  const app = appWith({
    renderPng: async (input) => {
      name = input.values.learnerName;
      return pngOf(400, 300);
    }
  });
  await request(app)
    .post("/api/admin/certificates-template/preview")
    .set("Authorization", `Bearer ${token("editor")}`)
    .send({ payload: TEMPLATE, sampleId: "no-such-sample" })
    .expect(200);
  assert.equal(name, CERTIFICATE_PREVIEW_SAMPLES[0]?.learnerName);
});

test("the sample set spans the range the sanitiser admits", async () => {
  // A layout signed off against "Ada Obi" and then met with a long hyphenated
  // name produces a certificate with the learner's own name running off the
  // artwork, permanently.
  const app = appWith();
  const response = await request(app)
    .get("/api/admin/certificates-template/samples")
    .set("Authorization", `Bearer ${token("viewer")}`)
    .expect(200);
  const lengths = response.body.items.map((item: { learnerName: string }) => item.learnerName.length);
  assert.ok(Math.min(...lengths) <= 10, "there must be a short name");
  assert.ok(Math.max(...lengths) >= 50, "there must be a name long enough to test the shrink");
  assert.ok(
    Math.max(...lengths) <= MAX_NAME_LENGTH,
    "a sample longer than the sanitiser allows would test a case that cannot occur"
  );
});

test("creating a template against artwork that was never uploaded is refused", async () => {
  const app = appWith({ assetSize: async () => null });
  const response = await request(app)
    .post("/api/admin/certificates-template")
    .set("Authorization", `Bearer ${token("admin")}`)
    .send({ assetKey: "certificate-background-v9", programmeName: "P", issuerName: "I" });
  assert.equal(response.status, 400);
  assert.match(response.body.message, /certificate-background-v9/);
});

test("the starter template is valid, disabled, and sized to the artwork it was given", () => {
  const starter = buildStarterTemplate({
    assetKey: "bg-v1",
    width: 1600,
    height: 1200,
    programmeName: "P",
    issuerName: "I"
  });
  assert.equal(starter.enabled, false, "a layout nobody has looked at must not issue anything");
  assert.deepEqual(starter.canvas, { width: 1600, height: 1200 });
  assert.deepEqual(referencedAssetKeys(starter), ["bg-v1"]);
  const variables = starter.fields.map((field) => field.variable);
  assert.deepEqual(new Set(variables), new Set(["learnerName", "bodyText", "issuedDate", "certificateId", "qrCode"]));
});
