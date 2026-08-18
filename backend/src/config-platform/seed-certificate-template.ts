/**
 * Loads the certificate artwork into `certificate_assets` and writes the
 * matching `certificate.template` payload out for publishing.
 *
 * Assets go straight through Prisma rather than an HTTP endpoint because the
 * upload route is Phase 2 work, and because these are binary files sitting in
 * the repo rather than something an operator picks in a browser.
 *
 * The template itself is NOT published from here. It is a config document, and
 * config documents in this project go through the draft/publish path so they
 * get version history, an audit trail and a rollback. So the payload is written
 * to docs/config-seeds/ and published from the dashboard like every other
 * document.
 *
 * Idempotent: re-running replaces each asset's bytes under the same key.
 *
 *   POSTGRES_URL=... npm run seed:certificate-template -w @shetrades/backend
 */
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import sharp from "sharp";
import { prisma } from "../admin/prisma.js";
import { DEFAULT_CERTIFICATE_TEMPLATE } from "../certificates/template-default.js";

const ASSET_DIR = "assets/certificates/";
const PAYLOAD_OUT = "../docs/config-seeds/certificate-template.json";

/**
 * Keys are VERSIONED and must be treated as immutable: an issued certificate
 * freezes the template that produced it, and that snapshot refers to assets by
 * key. Re-pointing a key at different bytes would silently redraw credentials
 * already in learners' hands. New artwork means a new key.
 */
const ASSETS: ReadonlyArray<{ key: string; kind: "background" | "logo"; file: string }> = [
  { key: "certificate-background-v1", kind: "background", file: "certificate-background-v1.png" },
  { key: "logo-care-v1", kind: "logo", file: "logo-care-v1.png" },
  { key: "logo-techher-v1", kind: "logo", file: "logo-techher-v1.png" },
  { key: "logo-sheconnects-v1", kind: "logo", file: "logo-sheconnects-v1.png" },
  { key: "logo-sdp-badge-v1", kind: "logo", file: "logo-sdp-badge-v1.png" }
];

async function seedAsset(entry: (typeof ASSETS)[number]) {
  const bytes = await readFile(`${ASSET_DIR}${entry.file}`);
  const meta = await sharp(bytes).metadata();
  const width = meta.width ?? 0;
  const height = meta.height ?? 0;
  if (!width || !height) {
    throw new Error(`${entry.file} has no readable dimensions`);
  }
  const checksum = createHash("sha256").update(bytes).digest("hex");
  await prisma.certificateAsset.upsert({
    where: { key: entry.key },
    update: { bytes, kind: entry.kind, mimeType: "image/png", width, height, checksum },
    create: {
      key: entry.key,
      kind: entry.kind,
      mimeType: "image/png",
      bytes,
      width,
      height,
      checksum,
      uploadedBy: "seed"
    }
  });
  console.log(
    JSON.stringify({
      event: "certificate.asset.seeded",
      key: entry.key,
      size: `${width}x${height}`,
      bytes: bytes.length,
      checksum: checksum.slice(0, 12)
    })
  );
}

async function main() {
  // Every asset the template references must exist, or the renderer throws at
  // request time instead of here. Check before writing anything.
  const referenced = new Set<string>([DEFAULT_CERTIFICATE_TEMPLATE.assetKey]);
  for (const field of DEFAULT_CERTIFICATE_TEMPLATE.fields) {
    if ("assetKey" in field && field.assetKey) referenced.add(field.assetKey);
  }
  const seeded = new Set(ASSETS.map((a) => a.key));
  const missing = [...referenced].filter((key) => !seeded.has(key));
  if (missing.length > 0) {
    throw new Error(`Template references assets this seed does not supply: ${missing.join(", ")}`);
  }

  for (const entry of ASSETS) {
    await seedAsset(entry);
  }

  await mkdir("../docs/config-seeds", { recursive: true });
  await writeFile(PAYLOAD_OUT, `${JSON.stringify(DEFAULT_CERTIFICATE_TEMPLATE, null, 2)}\n`, "utf8");

  console.log(
    [
      "",
      `Assets seeded. Template payload written to docs/config-seeds/certificate-template.json`,
      "",
      "To finish, in the dashboard:",
      "  1. Config -> create a document, namespace `integration`, type",
      "     `integration_config`, key `certificate.template`",
      "  2. Paste the payload from that file into the draft, and publish it",
      "  3. Leave `enabled` FALSE until the design has been signed off - that",
      "     flag is the only thing between a half-checked template and a",
      "     learner's permanent credential",
      ""
    ].join("\n")
  );
}

main()
  .catch((error) => {
    console.error(JSON.stringify({ event: "certificate.seed.error", message: String(error) }));
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
