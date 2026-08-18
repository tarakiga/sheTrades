import test from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import { certificateTemplatePayloadSchema, type CertificateTemplatePayload } from "./contracts.js";
import type { TextValues } from "./layout.js";
import type { AssetLoader, LoadedAsset } from "./assets.js";
import { renderCertificatePng } from "./render.js";

const CANVAS = { width: 1200, height: 850 };
const BACKGROUND_KEY = "certificate.background.v1";
const LOGO_KEY = "certificate.logo.itc";
const VERIFY_URL = "https://shetrades.example/verify/aaaabbbbccccddddeeeeffffgggghhhh";

const VALUES: TextValues = {
  learnerName: "Adaeze Okonkwo",
  programmeName: "SheTrades Nigeria",
  issuedDate: "18 August 2026",
  certificateId: "aaaabbbbccccddddeeeeffffgggghhhh"
};

const NAME_FIELD = {
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
};

const DATE_FIELD = {
  id: "date",
  variable: "issuedDate",
  x: 0.5,
  y: 0.7,
  maxWidth: 0.4,
  align: "center",
  font: "DejaVu Sans",
  size: 0.025,
  weight: 400,
  color: "#555555"
};

const LOGO_FIELD = { id: "logo", variable: "logo", assetKey: LOGO_KEY, x: 0.08, y: 0.08, width: 0.15, align: "left" };

const QR_FIELD = { id: "qr", variable: "qrCode", x: 0.88, y: 0.78, width: 0.09, align: "left" };

/** Parsed through the real schema rather than hand-typed, so every fixture
 * carries the same defaults (align, weight, autoShrink, opacity) a published
 * document would, instead of a shape only this file believes in. */
function buildTemplate(overrides: Record<string, unknown> = {}): CertificateTemplatePayload {
  return certificateTemplatePayloadSchema.parse({
    kind: "certificate_template",
    enabled: true,
    programmeName: "SheTrades Nigeria",
    issuerName: "ITC SheTrades",
    assetKey: BACKGROUND_KEY,
    canvas: CANVAS,
    fields: [NAME_FIELD, DATE_FIELD, LOGO_FIELD, QR_FIELD],
    ...overrides
  });
}

async function backgroundPng(width: number, height: number): Promise<Buffer> {
  return sharp({
    create: { width, height, channels: 4, background: { r: 250, g: 250, b: 250, alpha: 1 } }
  })
    .png()
    .toBuffer();
}

async function solidAsset(width: number, height: number, r: number, g: number, b: number): Promise<LoadedAsset> {
  const bytes = await sharp({ create: { width, height, channels: 4, background: { r, g, b, alpha: 1 } } })
    .png()
    .toBuffer();
  return { bytes, width, height };
}

/** An injected loader over a fixed map: storage is the renderer's only
 * contact with the outside world, so stubbing it is what lets this whole
 * file run with no database and no filesystem. */
function loaderFor(assets: Map<string, LoadedAsset>): { loadAsset: AssetLoader; keysRequested: string[] } {
  const keysRequested: string[] = [];
  const loadAsset: AssetLoader = async (key) => {
    keysRequested.push(key);
    return assets.get(key) ?? null;
  };
  return { loadAsset, keysRequested };
}

async function fullAssetMap(): Promise<Map<string, LoadedAsset>> {
  const background = await backgroundPng(CANVAS.width, CANVAS.height);
  return new Map<string, LoadedAsset>([
    [BACKGROUND_KEY, { bytes: background, width: CANVAS.width, height: CANVAS.height }],
    [LOGO_KEY, await solidAsset(400, 200, 20, 80, 160)]
  ]);
}

/** Asset keys are dotted, and a dot is a regex wildcard: matched raw, a
 * "missing asset" assertion would also pass on a message naming a
 * different key. */
function literally(key: string): RegExp {
  return new RegExp(key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
}

test("renders a PNG at the template canvas size", async () => {
  const { loadAsset } = loaderFor(await fullAssetMap());
  const png = await renderCertificatePng({
    template: buildTemplate(),
    values: VALUES,
    verifyUrl: VERIFY_URL,
    loadAsset
  });

  const meta = await sharp(png).metadata();
  assert.equal(meta.format, "png");
  assert.equal(meta.width, CANVAS.width);
  assert.equal(meta.height, CANVAS.height);
});

test("a missing background asset fails loudly instead of issuing a blank certificate", async () => {
  // A silently blank certificate would be issued, sent over WhatsApp and
  // believed -- and the public verification page would confirm it. A 500 an
  // admin can see is the strictly better failure.
  const { loadAsset } = loaderFor(new Map());
  await assert.rejects(
    renderCertificatePng({ template: buildTemplate(), values: VALUES, verifyUrl: VERIFY_URL, loadAsset }),
    literally(BACKGROUND_KEY)
  );
});

test("a logo field naming an asset that does not exist fails loudly", async () => {
  const assets = await fullAssetMap();
  assets.delete(LOGO_KEY);
  const { loadAsset } = loaderFor(assets);

  await assert.rejects(
    renderCertificatePng({ template: buildTemplate(), values: VALUES, verifyUrl: VERIFY_URL, loadAsset }),
    literally(LOGO_KEY)
  );
});

test("a qrCode field renders without any stored asset of its own", async () => {
  const assets = await fullAssetMap();
  assets.delete(LOGO_KEY);
  const { loadAsset, keysRequested } = loaderFor(assets);

  const png = await renderCertificatePng({
    template: buildTemplate({ fields: [NAME_FIELD, QR_FIELD] }),
    values: VALUES,
    verifyUrl: VERIFY_URL,
    loadAsset
  });

  const meta = await sharp(png).metadata();
  assert.equal(meta.format, "png");
  assert.equal(meta.width, CANVAS.width);
  // The QR is generated from the verify URL, so storage is never consulted
  // for it -- only the background was ever requested.
  assert.deepEqual(keysRequested, [BACKGROUND_KEY]);
});

test("a learner name carrying markup still produces a valid PNG", async () => {
  // If the escaping in layout.ts ever regressed, the malformed layer would
  // make sharp throw rather than quietly draw a tag -- so "the output parses
  // as a PNG" is a real assertion about the escaping, not a formality.
  const { loadAsset } = loaderFor(await fullAssetMap());
  const png = await renderCertificatePng({
    template: buildTemplate(),
    values: { ...VALUES, learnerName: "</text><script>alert(1)</script>" },
    verifyUrl: VERIFY_URL,
    loadAsset
  });

  const meta = await sharp(png).metadata();
  assert.equal(meta.format, "png");
  assert.equal(meta.width, CANVAS.width);
  assert.equal(meta.height, CANVAS.height);
});

test("a template with only text fields renders", async () => {
  const { loadAsset } = loaderFor(await fullAssetMap());
  const png = await renderCertificatePng({
    template: buildTemplate({ fields: [NAME_FIELD, DATE_FIELD] }),
    values: VALUES,
    verifyUrl: VERIFY_URL,
    loadAsset
  });

  const meta = await sharp(png).metadata();
  assert.equal(meta.format, "png");
  assert.equal(meta.width, CANVAS.width);
  assert.equal(meta.height, CANVAS.height);
});

test("a partially transparent logo still renders", async () => {
  const { loadAsset } = loaderFor(await fullAssetMap());
  const png = await renderCertificatePng({
    template: buildTemplate({ fields: [NAME_FIELD, { ...LOGO_FIELD, opacity: 0.35 }] }),
    values: VALUES,
    verifyUrl: VERIFY_URL,
    loadAsset
  });

  const meta = await sharp(png).metadata();
  assert.equal(meta.format, "png");
  assert.equal(meta.width, CANVAS.width);
});

test("a malformed template document fails loudly rather than rendering a corrupt image", async () => {
  // getRuntimeCertificateTemplate() hands back its value by TYPE ASSERTION,
  // not validation: a document seeded straight into the database is never
  // re-checked on read. The cast below is not a shortcut -- it reproduces
  // exactly what the call site already believes about a template it never
  // parsed.
  const malformed = {
    kind: "certificate_template",
    enabled: true,
    programmeName: "SheTrades Nigeria",
    issuerName: "ITC SheTrades",
    assetKey: BACKGROUND_KEY,
    canvas: { width: 1200 },
    fields: [{ id: "name", variable: "learnerName", x: 0.5, y: 0.45 }]
  } as unknown as CertificateTemplatePayload;

  const { loadAsset } = loaderFor(await fullAssetMap());
  await assert.rejects(
    renderCertificatePng({ template: malformed, values: VALUES, verifyUrl: VERIFY_URL, loadAsset }),
    /template/i
  );
});

test("a qrCode field with no verify URL fails rather than printing a QR that leads nowhere", async () => {
  const { loadAsset } = loaderFor(await fullAssetMap());
  await assert.rejects(
    renderCertificatePng({
      template: buildTemplate({ fields: [NAME_FIELD, QR_FIELD] }),
      values: VALUES,
      verifyUrl: "   ",
      loadAsset
    }),
    /verify/i
  );
});
