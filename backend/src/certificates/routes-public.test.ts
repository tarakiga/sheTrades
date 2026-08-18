import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import request from "supertest";
import { createApp } from "../app.js";
import { certificateTemplatePayloadSchema, type CertificateTemplatePayload } from "./contracts.js";
import {
  buildVerifyPageHtml,
  createCertificatePublicRouter,
  createFixedWindowLimiter,
  type CertificatePublicDeps,
  type PublicCertificateRow
} from "./routes-public.js";

const PUBLIC_ID = "aaaabbbbccccddddeeeeffffgggghhhh";
const BASE_URL = "https://verify.example";
const IMAGE_URL = `${BASE_URL}/c/${PUBLIC_ID}.png`;

const TEMPLATE: CertificateTemplatePayload = certificateTemplatePayloadSchema.parse({
  kind: "certificate_template",
  enabled: true,
  programmeName: "SheTrades Nigeria",
  issuerName: "ITC SheTrades",
  assetKey: "certificate.background.v1",
  canvas: { width: 1200, height: 850 },
  fields: [
    {
      id: "name",
      variable: "learnerName",
      x: 0.5,
      y: 0.45,
      maxWidth: 0.7,
      align: "center",
      font: "DejaVu Sans",
      size: 0.06,
      weight: 600,
      color: "#1a1a1a"
    }
  ]
});

/**
 * The template this certificate was ISSUED under, deliberately different from
 * the live one above in every way that shows on the artwork: a different
 * background asset, a different canvas, the name in a different place.
 *
 * A redesign is exactly this -- the live document moves on, and the row must
 * not move with it.
 */
const SNAPSHOT_TEMPLATE: CertificateTemplatePayload = certificateTemplatePayloadSchema.parse({
  kind: "certificate_template",
  enabled: true,
  programmeName: "SheTrades Nigeria",
  issuerName: "ITC SheTrades",
  assetKey: "certificate.background.v0",
  canvas: { width: 900, height: 640 },
  fields: [
    {
      id: "name",
      variable: "learnerName",
      x: 0.4,
      y: 0.6,
      maxWidth: 0.6,
      align: "left",
      font: "DejaVu Serif",
      size: 0.05,
      weight: 400,
      color: "#333333"
    }
  ]
});

const ROW: PublicCertificateRow = {
  publicId: PUBLIC_ID,
  learnerName: "Adaeze Okonkwo",
  programmeName: "SheTrades Nigeria",
  issuedAt: new Date("2026-08-18T09:30:00Z"),
  revokedAt: null,
  templateSnapshot: SNAPSHOT_TEMPLATE
};

const PNG_BYTES = Buffer.from("fake-png-bytes");

type Recorder = { lookups: string[]; renders: number; templates: CertificateTemplatePayload[] };

function buildTestApp(overrides: Partial<CertificatePublicDeps> = {}): {
  app: express.Express;
  recorder: Recorder;
} {
  const recorder: Recorder = { lookups: [], renders: 0, templates: [] };
  const deps: Partial<CertificatePublicDeps> = {
    findByPublicId: async (publicId) => {
      recorder.lookups.push(publicId);
      return publicId === PUBLIC_ID ? ROW : null;
    },
    getTemplate: () => TEMPLATE,
    renderPng: async (input) => {
      recorder.renders += 1;
      recorder.templates.push(input.template);
      return PNG_BYTES;
    },
    baseUrl: () => BASE_URL,
    ...overrides
  };
  const app = express();
  app.use("/", createCertificatePublicRouter(deps));
  return { app, recorder };
}

test("buildVerifyPageHtml states who was awarded what, by whom and when", () => {
  const html = buildVerifyPageHtml({
    learnerName: "Adaeze Okonkwo",
    programmeName: "SheTrades Nigeria",
    issuerName: "ITC SheTrades",
    issuedAt: new Date("2026-08-18T09:30:00Z"),
    revokedAt: null,
    imageUrl: IMAGE_URL
  });

  assert.ok(html.includes("Adaeze Okonkwo"));
  assert.ok(html.includes("SheTrades Nigeria"));
  assert.ok(html.includes("ITC SheTrades"));
  assert.ok(html.includes("18 August 2026"));
  assert.ok(html.includes(IMAGE_URL));
  // Opened by strangers on unknown devices: nothing may be fetched or executed.
  assert.ok(!html.includes("<script"));
  assert.ok(!html.includes("http://"));
  assert.doesNotMatch(html, /src="https:[/][/](?!verify[.]example)/);
});

test("buildVerifyPageHtml says plainly when a certificate is revoked", () => {
  const revoked = buildVerifyPageHtml({
    learnerName: "Adaeze Okonkwo",
    programmeName: "SheTrades Nigeria",
    issuerName: "ITC SheTrades",
    issuedAt: new Date("2026-08-18T09:30:00Z"),
    revokedAt: new Date("2026-09-01T00:00:00Z"),
    imageUrl: IMAGE_URL
  });

  assert.match(revoked, /revoke/i);
  assert.match(revoked, /no longer valid/i);
});

test("buildVerifyPageHtml does not cry revoked over a valid certificate", () => {
  const valid = buildVerifyPageHtml({
    learnerName: "Adaeze Okonkwo",
    programmeName: "SheTrades Nigeria",
    issuerName: "ITC SheTrades",
    issuedAt: new Date("2026-08-18T09:30:00Z"),
    revokedAt: null,
    imageUrl: IMAGE_URL
  });

  assert.doesNotMatch(valid, /revoke/i);
  assert.doesNotMatch(valid, /no longer valid/i);
});

test("buildVerifyPageHtml escapes learner-supplied and admin-supplied text", () => {
  const html = buildVerifyPageHtml({
    // Reaches this page from a WhatsApp display name.
    learnerName: '<script>alert(1)</script>',
    // Reaches this page from an admin-editable config document.
    programmeName: 'SheTrades" onload="alert(2)',
    issuerName: "Fisher & Sons",
    issuedAt: new Date("2026-08-18T09:30:00Z"),
    revokedAt: null,
    imageUrl: IMAGE_URL
  });

  assert.ok(!html.includes("<script>alert(1)</script>"));
  assert.ok(!html.includes('onload="alert(2)'));
  assert.ok(html.includes("&lt;script&gt;"));
  assert.ok(html.includes("Fisher &amp; Sons"));
});

/**
 * There WAS a test here asserting the finished page contains no
 * phone-number-shaped string. It was deleted, deliberately.
 *
 * It passed no phone-shaped input, so the only way it could ever go red was a
 * seven-digit run appearing in PAGE_STYLE or the date format -- it policed the
 * CSS, not the privacy rule it was named for. Feeding it phone numbers instead
 * would not have saved it: every field it can be given is PRINTED on the page,
 * so a phone number passed in legitimately appears in the output and the
 * assertion inverts into nonsense.
 *
 * The property it claimed to defend -- no phone number can reach this page --
 * is a type-level one. VerifyPageInput has no field that could carry one, and
 * the refactor the comment feared ("just pass the whole row / the whole user")
 * changes the signature, which fails to compile at every call site including
 * this file. That is a stronger guarantee than the assertion was, and it costs
 * nothing to maintain -- whereas the deleted test imposed a real constraint on
 * the stylesheet ("no numeric literal may run to seven digits") for no coverage
 * at all.
 */

test("buildVerifyPageHtml cannot be broken out of an HTML attribute", () => {
  // The one real attribute-context sink on this page: imageUrl and learnerName
  // are both interpolated inside double-quoted attributes on the same <img>.
  // imageUrl is built from PUBLIC_BASE_URL (admin/env config) and learnerName
  // comes from a WhatsApp display name.
  const html = buildVerifyPageHtml({
    learnerName: 'Ada" onmouseover="alert(1)',
    programmeName: "SheTrades Nigeria",
    issuerName: "ITC SheTrades",
    issuedAt: new Date("2026-08-18T09:30:00Z"),
    revokedAt: null,
    imageUrl: `${IMAGE_URL}" onerror="alert(2)`
  });

  // Neither payload may terminate its attribute. If either did, everything
  // after the quote is parsed as further attributes on the <img>.
  assert.ok(!html.includes('onerror="alert(2)'));
  assert.ok(!html.includes('onmouseover="alert(1)'));
  assert.ok(html.includes("&quot;"));

  // Stronger than "the payload is absent": the tag must still be ONE tag with
  // exactly two attributes, so the quotes closing src and alt are the ones this
  // module wrote and not ones the caller supplied.
  const img = html.match(/<img src="([^"]*)" alt="([^"]*)">/);
  assert.ok(img, "the img tag should still parse as src + alt and nothing else");
  // Both payloads survive as TEXT inside their attribute -- quote neutralised,
  // handler inert -- rather than having escaped into attribute position.
  assert.ok(img[1]!.includes("&quot; onerror=&quot;alert(2)"));
  assert.ok(img[2]!.includes("&quot; onmouseover=&quot;alert(1)"));
  assert.equal(html.match(/<img /g)?.length, 1);
});

test("an unknown id 404s identically on both routes", async () => {
  const { app } = buildTestApp();

  const png = await request(app).get("/c/nosuchcertificate.png");
  const page = await request(app).get("/c/nosuchcertificate");

  assert.equal(png.status, 404);
  assert.equal(page.status, 404);
  // Byte-identical: any difference at all turns these URLs into an oracle for
  // "does this certificate id exist".
  assert.equal(png.text, page.text);
  assert.equal(png.headers["content-type"], page.headers["content-type"]);
  assert.equal(png.headers["cache-control"], page.headers["cache-control"]);
});

test("a withheld certificate is indistinguishable from an unknown id", async () => {
  const { app: known } = buildTestApp();
  const unknownBody = (await request(known).get("/c/nosuchcertificate")).text;

  // No published template: the certificate exists, but we will not show it.
  const { app: noTemplate } = buildTestApp({ getTemplate: () => null });
  const withheldPage = await request(noTemplate).get(`/c/${PUBLIC_ID}`);
  const withheldPng = await request(noTemplate).get(`/c/${PUBLIC_ID}.png`);

  assert.equal(withheldPage.status, 404);
  assert.equal(withheldPng.status, 404);
  assert.equal(withheldPage.text, unknownBody);
  assert.equal(withheldPng.text, unknownBody);
});

test("the .png route is not swallowed by the bare verification route", async () => {
  const { app, recorder } = buildTestApp();

  const response = await request(app).get(`/c/${PUBLIC_ID}.png`);

  assert.equal(response.status, 200);
  assert.equal(response.headers["content-type"], "image/png");
  assert.equal(response.headers["cache-control"], "public, max-age=86400");
  assert.equal(response.headers["x-content-type-options"], "nosniff");
  assert.deepEqual(response.body, PNG_BYTES);
  assert.equal(recorder.renders, 1);
  // The suffix belongs to the ROUTE, not to the id. If the bare route matched
  // first this would be "<id>.png" and the lookup would miss.
  assert.deepEqual(recorder.lookups, [PUBLIC_ID]);
});

test("the bare route serves the verification page", async () => {
  const { app, recorder } = buildTestApp();

  const response = await request(app).get(`/c/${PUBLIC_ID}`);

  assert.equal(response.status, 200);
  assert.match(response.headers["content-type"] ?? "", /text[/]html/);
  assert.ok(response.text.includes("Adaeze Okonkwo"));
  assert.ok(response.text.includes(IMAGE_URL));
  assert.equal(recorder.renders, 0);
  assert.deepEqual(recorder.lookups, [PUBLIC_ID]);
});

test("an unconfigured base URL is a clean 500, not an unhandled rejection", async () => {
  const { app } = buildTestApp({ baseUrl: () => "" });

  const png = await request(app).get(`/c/${PUBLIC_ID}.png`);
  const page = await request(app).get(`/c/${PUBLIC_ID}`);

  assert.equal(png.status, 500);
  assert.equal(page.status, 500);
});

// ---- the artwork is frozen at issue time -------------------------------------

test("the png is rendered from the template FROZEN ON THE ROW, not the live one", async () => {
  const { app, recorder } = buildTestApp();

  const response = await request(app).get(`/c/${PUBLIC_ID}.png`);

  assert.equal(response.status, 200);
  assert.equal(recorder.renders, 1);
  // This is the whole point of Certificate.templateSnapshot. The live template
  // has moved on -- different background asset, different canvas, name in a
  // different place -- and the credential the learner already holds and has
  // already shared must not move with it. Revert routes-public.ts to reading
  // deps.getTemplate() here and this test asserts TEMPLATE instead.
  assert.deepEqual(recorder.templates[0], SNAPSHOT_TEMPLATE);
  assert.equal(recorder.templates[0]?.assetKey, "certificate.background.v0");
  assert.notEqual(recorder.templates[0]?.assetKey, TEMPLATE.assetKey);
});

test("a row with no snapshot falls back to the live template", async () => {
  // Defensive only: no such row exists in production. The column is nullable
  // so a row written before it existed still renders rather than 500ing.
  const legacy: PublicCertificateRow = { ...ROW, templateSnapshot: null };
  const { app, recorder } = buildTestApp({ findByPublicId: async () => legacy });

  const response = await request(app).get(`/c/${PUBLIC_ID}.png`);

  assert.equal(response.status, 200);
  assert.deepEqual(recorder.templates[0], TEMPLATE);
});

test("a malformed snapshot is a 500, never artwork drawn from the live template", async () => {
  // A JSONB column is whatever was written into it -- by an older release, by
  // a seed script, by a hand-run UPDATE. Falling back to the live template here
  // would silently produce the redesign this feature exists to prevent, on a
  // credential nobody can tell is wrong.
  const broken: PublicCertificateRow = {
    ...ROW,
    templateSnapshot: { kind: "certificate_template", enabled: true }
  };
  const { app, recorder } = buildTestApp({ findByPublicId: async () => broken });

  const response = await request(app).get(`/c/${PUBLIC_ID}.png`);

  assert.equal(response.status, 500);
  assert.equal(recorder.renders, 0);
  // The reason names config internals; it belongs in the log, not the body.
  assert.ok(!response.text.includes("canvas"));
  assert.ok(!response.text.includes("malformed"));
});

// ---- the png route is not a render-on-demand endpoint -------------------------

test("a repeat view of the same certificate is served without re-rendering", async () => {
  const { app, recorder } = buildTestApp();

  const first = await request(app).get(`/c/${PUBLIC_ID}.png`);
  const second = await request(app).get(`/c/${PUBLIC_ID}.png`);

  assert.equal(first.status, 200);
  assert.equal(second.status, 200);
  // Nothing about the response may betray that it came from the cache.
  assert.deepEqual(second.body, PNG_BYTES);
  assert.equal(second.headers["content-type"], "image/png");
  assert.equal(second.headers["cache-control"], "public, max-age=86400");
  assert.equal(second.headers["x-content-type-options"], "nosniff");
  // An asset read per field, a QR rasterisation and several sharp composites,
  // paid once instead of twice.
  assert.equal(recorder.renders, 1);
  // The row lookup is NOT skipped: the cache key is derived from the row, and a
  // deleted certificate must stop resolving immediately.
  assert.equal(recorder.lookups.length, 2);
});

test("a changed template invalidates the cached bytes", async () => {
  // The cache key carries a fingerprint of the template actually being drawn
  // from, so a backfilled snapshot -- or a republished live template behind a
  // pre-snapshot row -- cannot keep serving the previous artwork.
  let snapshot: unknown = SNAPSHOT_TEMPLATE;
  const { app, recorder } = buildTestApp({
    findByPublicId: async () => ({ ...ROW, templateSnapshot: snapshot })
  });

  await request(app).get(`/c/${PUBLIC_ID}.png`);
  snapshot = TEMPLATE;
  await request(app).get(`/c/${PUBLIC_ID}.png`);

  assert.equal(recorder.renders, 2);
  assert.deepEqual(recorder.templates[0], SNAPSHOT_TEMPLATE);
  assert.deepEqual(recorder.templates[1], TEMPLATE);
});

test("one caller cannot monopolise the render path", async () => {
  const previous = process.env.CERTIFICATE_PNG_RATE_LIMIT;
  process.env.CERTIFICATE_PNG_RATE_LIMIT = "2";
  try {
    // Read when the router is built, so this has to be set first.
    const { app } = buildTestApp();

    const first = await request(app).get(`/c/${PUBLIC_ID}.png`);
    const second = await request(app).get(`/c/${PUBLIC_ID}.png`);
    const third = await request(app).get(`/c/${PUBLIC_ID}.png`);

    assert.equal(first.status, 200);
    assert.equal(second.status, 200);
    assert.equal(third.status, 429);
    assert.ok(Number(third.headers["retry-after"]) > 0);
    assert.equal(third.headers["cache-control"], "no-store");

    // The verification page is a cheap string build and is NOT charged to the
    // render budget: an employer opening the page must not be refused because
    // something else hammered the image.
    await request(app).get(`/c/${PUBLIC_ID}`).expect(200);
  } finally {
    if (previous === undefined) delete process.env.CERTIFICATE_PNG_RATE_LIMIT;
    else process.env.CERTIFICATE_PNG_RATE_LIMIT = previous;
  }
});

test("the render budget fails open rather than refusing", () => {
  // This is a fairness guard, not a security control. Every uncertain case has
  // to resolve to "allowed": refusing Meta the image means the certificate is
  // never delivered at all, which is far worse than a few extra renders.
  const allow = createFixedWindowLimiter(1, 60_000);

  // No identifiable caller. Bucketing these together would let one of them
  // throttle all of them.
  assert.equal(allow(undefined), true);
  assert.equal(allow(undefined), true);
  assert.equal(allow(""), true);

  assert.equal(allow("1.2.3.4"), true);
  assert.equal(allow("1.2.3.4"), false);
  // Per caller, not global.
  assert.equal(allow("5.6.7.8"), true);
});

test("the render budget resets when the window rolls over", () => {
  const allow = createFixedWindowLimiter(1, 1);
  assert.equal(allow("1.2.3.4"), true);
  assert.equal(allow("1.2.3.4"), false);
  // A one-millisecond window: by the time the event loop comes back around the
  // window has advanced, so the counter must have been cleared rather than
  // holding the caller out forever.
  return new Promise<void>((resolve) => {
    setTimeout(() => {
      assert.equal(allow("1.2.3.4"), true);
      resolve();
    }, 5);
  });
});

test("both public routes are mounted on the app", async () => {
  // No certificate template is published in a bare test process, so both
  // routes take the withheld branch -- which is exactly the 404 an unknown id
  // gets, and needs no database to reach.
  const app = createApp();

  await request(app).get("/c/nosuchcertificate.png").expect(404);
  await request(app).get("/c/nosuchcertificate").expect(404);
});
