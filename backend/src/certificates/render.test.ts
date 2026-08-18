import test from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import { certificateTemplatePayloadSchema, type CertificateTemplatePayload } from "./contracts.js";
import { estimateLineWidthPx, fitWrappedText, type TextValues } from "./layout.js";
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

test("a corrupt logo asset names the key and the field that failed", async () => {
  // On its own sharp says only "Input buffer contains unsupported image
  // format": no key, no field. A template may carry several logos, so that
  // message alone cannot tell an admin which asset to re-upload.
  const assets = await fullAssetMap();
  assets.set(LOGO_KEY, { bytes: Buffer.from("this is definitely not an image"), width: 400, height: 200 });
  const { loadAsset } = loaderFor(assets);

  await assert.rejects(
    renderCertificatePng({ template: buildTemplate(), values: VALUES, verifyUrl: VERIFY_URL, loadAsset }),
    (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.match(error.message, literally(LOGO_KEY));
      assert.match(error.message, /field "logo"/);
      // The original is kept rather than swallowed -- the wrapper adds the
      // identity sharp cannot know, it does not replace the diagnosis.
      assert.ok(error.cause instanceof Error);
      return true;
    }
  );
});

test("a hostile SVG logo cannot paint outside the box it was placed in", async () => {
  // The rasterisation guarantee, on the path that actually matters. The QR
  // is an SVG too, but it is library-generated; only a stored logo asset is
  // hand-authored, so this is the only place the boundary is under pressure.
  //
  // The assertion is containment, not a marker string. A marker cannot work:
  // the output is a rasterised PNG either way, so the literal text is absent
  // whether the SVG was rasterised first or inlined into the text layer --
  // the check would pass through exactly the regression it is meant to
  // catch. What DOES differ is reach. Rasterised at its own 400x200 viewport
  // the logo is clipped to its placed box; inlined into the canvas-sized
  // layer that carries the learner name, the same markup could paint over
  // the whole certificate.
  const hostileSvg =
    '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="200">' +
    '<rect x="-50000" y="-50000" width="100000" height="100000" fill="#ff0000"/>' +
    '<text x="10" y="100" font-size="24" fill="#000000">INJECTED</text>' +
    "</svg>";

  const assets = await fullAssetMap();
  assets.set(LOGO_KEY, { bytes: Buffer.from(hostileSvg), width: 400, height: 200 });
  const { loadAsset } = loaderFor(assets);

  const png = await renderCertificatePng({
    template: buildTemplate({ fields: [NAME_FIELD, LOGO_FIELD] }),
    values: VALUES,
    verifyUrl: VERIFY_URL,
    loadAsset
  });

  const raw = await sharp(png).ensureAlpha().raw().toBuffer();
  const pixelAt = (x: number, y: number): [number, number, number] => {
    const i = (y * CANVAS.width + x) * 4;
    return [raw[i] ?? -1, raw[i + 1] ?? -1, raw[i + 2] ?? -1];
  };

  // LOGO_FIELD places a 180x90 box at (96, 68). Assert the hostile fill
  // landed INSIDE it first: without this the containment check below would
  // also pass if the asset had silently failed to render at all.
  const [insideR, insideG, insideB] = pixelAt(150, 100);
  assert.ok(insideR > 200 && insideG < 60 && insideB < 60, `expected red inside the logo box, got ${insideR},${insideG},${insideB}`);

  // Far outside the box: still the untouched background. If the SVG were
  // inlined rather than rasterised, that 100000px rect would have covered
  // this pixel.
  assert.deepEqual(pixelAt(1100, 800), [250, 250, 250]);

  // Costs nothing and guards a future where the renderer emitted anything
  // markup-shaped. It cannot fail today -- see the note above.
  assert.equal(png.includes(Buffer.from("INJECTED", "utf8")), false);
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

const PARAGRAPH =
  "In recognition of your successful completion of the " +
  "**SheTrades Digital Learning Programme** and your commitment to building " +
  "practical digital and business skills for greater economic opportunity.";

const BODY_FIELD = {
  id: "body",
  variable: "bodyText",
  text: PARAGRAPH,
  x: 0.5,
  y: 0.6,
  maxWidth: 0.8,
  align: "center",
  font: "DejaVu Sans",
  size: 0.04,
  weight: 400,
  color: "#333333",
  maxLines: 6
};

test("a long wrapped paragraph renders and stays inside the box it was given", async () => {
  const { loadAsset } = loaderFor(await fullAssetMap());
  const png = await renderCertificatePng({
    template: buildTemplate({ fields: [NAME_FIELD, BODY_FIELD, DATE_FIELD] }),
    values: VALUES,
    verifyUrl: VERIFY_URL,
    loadAsset
  });

  const meta = await sharp(png).metadata();
  assert.equal(meta.format, "png");
  assert.equal(meta.width, CANVAS.width);
  assert.equal(meta.height, CANVAS.height);

  // Pixels are not the assertion -- the geometry is. The same pure function
  // the renderer uses decides the wrap, so checking it here checks what was
  // actually drawn without decoding glyphs.
  const boxPx = Math.round(0.8 * CANVAS.width);
  const startPx = Math.round(0.04 * CANVAS.height);
  const fitted = fitWrappedText({ text: PARAGRAPH, maxWidthPx: boxPx, startPx, maxLines: 6 });

  assert.ok(fitted.lines.length > 1, "a 190-character paragraph must actually wrap");
  assert.ok(fitted.lines.length <= 6, `wrapped to ${fitted.lines.length} lines against a cap of 6`);
  for (const line of fitted.lines) {
    const width = estimateLineWidthPx(line, fitted.fontSizePx);
    assert.ok(width <= boxPx, `a line estimates ${width}px in a ${boxPx}px box`);
  }

  // The block is centred on x=0.5, so half its widest line either side must
  // still land on the canvas.
  const widest = Math.max(...fitted.lines.map((line) => estimateLineWidthPx(line, fitted.fontSizePx)));
  const centreX = 0.5 * CANVAS.width;
  assert.ok(centreX - widest / 2 >= 0);
  assert.ok(centreX + widest / 2 <= CANVAS.width);

  // And the block's last baseline must still be on the canvas, which is the
  // half of "inside the canvas" that wrapping -- not fitFontSize -- owns.
  const lastBaseline = 0.6 * CANVAS.height + (fitted.lines.length - 1) * 1.4 * fitted.fontSizePx;
  assert.ok(lastBaseline <= CANVAS.height, `last baseline at ${lastBaseline} on a ${CANVAS.height}px canvas`);
});

test("a paragraph carrying markup inside a bold run still produces a valid PNG", async () => {
  // Same reasoning as the learner-name case: if per-segment escaping ever
  // regressed, the malformed layer would make sharp throw rather than quietly
  // draw a tag. The bold split is the new path where that could happen.
  const { loadAsset } = loaderFor(await fullAssetMap());
  const png = await renderCertificatePng({
    template: buildTemplate({
      fields: [NAME_FIELD, { ...BODY_FIELD, text: 'ok **</text><script>alert(1)</script>** ok' }]
    }),
    values: VALUES,
    verifyUrl: VERIFY_URL,
    loadAsset
  });

  const meta = await sharp(png).metadata();
  assert.equal(meta.format, "png");
  assert.equal(meta.width, CANVAS.width);
});

test("a date field renders through the format its template configured", async () => {
  const { loadAsset } = loaderFor(await fullAssetMap());
  const png = await renderCertificatePng({
    template: buildTemplate({ fields: [{ ...DATE_FIELD, format: "long-ordinal" }] }),
    values: { ...VALUES, issuedDate: "2026-08-23" },
    verifyUrl: VERIFY_URL,
    loadAsset
  });

  const meta = await sharp(png).metadata();
  assert.equal(meta.format, "png");
});
