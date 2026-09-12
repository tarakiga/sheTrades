/**
 * Builds the "scan to start" poster for the bot's WhatsApp number.
 *
 * The number is REQUIRED and taken from the environment, with no default on
 * purpose: a default that is right today is wrong the day the number changes,
 * and a poster with a stale number is worse than no poster. Pass the number
 * in E.164 digits as it is registered with Meta.
 *
 *   WA_NUMBER=2348035125590 node build.mjs
 *
 * Renders through the same Chrome/Playwright route as the handbook screenshots
 * so Poppins is real rather than a local fallback, at 3x for print. Outputs:
 *
 *   shetrades-whatsapp-poster-<number>.png        A4 at ~288 dpi, for print
 *   shetrades-whatsapp-poster-<number>-share.png  1080 wide, for sending on WhatsApp
 *   shetrades-whatsapp-poster-<number>.html       the rendered page, printable from a browser
 *
 * It also renders the link-preview image for the public landing page straight
 * into the dashboard, where Next serves it as og:image by file convention:
 *
 *   dashboard/app/start/opengraph-image.png       1200x630, kept under 300 KB
 */
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createRequire } from "node:module";
import { chromium } from "file:///C:/Users/Dell/AppData/Local/npm-cache/_npx/5e2e484947874241/node_modules/playwright-core/index.mjs";

const require = createRequire(import.meta.url);
const QRCode = require("qrcode");
const sharp = require("../../backend/node_modules/sharp");

const here = dirname(fileURLToPath(import.meta.url));

const raw = (process.env.WA_NUMBER ?? "").replace(/[^\d]/g, "");
if (!/^\d{10,15}$/.test(raw)) {
  console.error("WA_NUMBER is required: the bot's number in E.164 digits, e.g. WA_NUMBER=2348035125590");
  process.exit(1);
}

// "hi" is what the bot's opening branch expects; it answers with the language
// question. Pre-filling it means a learner who scans only has to press send.
const waLink = `https://wa.me/${raw}?text=hi`;

// +234 803 512 5590 - grouped the way a Nigerian number is read aloud.
function pretty(digits) {
  if (digits.startsWith("234") && digits.length === 13) {
    return `+234 ${digits.slice(3, 6)} ${digits.slice(6, 9)} ${digits.slice(9)}`;
  }
  return `+${digits}`;
}

async function dataUri(path, mime) {
  const bytes = await readFile(path);
  return `data:${mime};base64,${bytes.toString("base64")}`;
}

// High error correction: a poster gets creased, photographed at an angle, and
// scanned under shop lighting. It costs density, which the size absorbs.
const qrSvg = await QRCode.toString(waLink, {
  type: "svg",
  errorCorrectionLevel: "H",
  margin: 0,
  color: { dark: "#0b675c", light: "#ffffff" }
});

const template = await readFile(join(here, "poster.html"), "utf8");
const html = template
  .replace("{{LOGO}}", await dataUri(join(here, "../logo/SHE TRADES DIGITAL LOGO.png"), "image/png"))
  .replace("{{BADGE}}", await dataUri(join(here, "../logo/badge.png"), "image/png"))
  .replace("{{QR}}", qrSvg)
  .replace("{{NUMBER}}", pretty(raw));

const base = join(here, `shetrades-whatsapp-poster-${raw}`);
await writeFile(`${base}.html`, html, "utf8");

const browser = await chromium.launch({
  executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe"
});
try {
  const page = await browser.newPage({ viewport: { width: 794, height: 1123 }, deviceScaleFactor: 3 });
  await page.setContent(html, { waitUntil: "networkidle" });
  // Google Fonts resolves asynchronously; without this the first frame can
  // carry the fallback face even after networkidle.
  await page.evaluate(() => document.fonts.ready);
  const poster = page.locator(".poster");
  const png = await poster.screenshot({ type: "png" });
  await writeFile(`${base}.png`, png);

  const share = await sharp(png).resize({ width: 1080 }).png().toBuffer();
  await writeFile(`${base}-share.png`, share);

  // The Open Graph card. 1200x630 exactly, and small: WhatsApp drops the image
  // from the preview entirely above a few hundred KB, silently. Rendered at 1x
  // because the card is already its display size, then quantised - a flat
  // design loses nothing to a palette and halves the bytes.
  const ogTemplate = await readFile(join(here, "og.html"), "utf8");
  const ogHtml = ogTemplate
    .replace("{{LOGO}}", await dataUri(join(here, "../logo/SHE TRADES DIGITAL LOGO.png"), "image/png"))
    .replace("{{NUMBER}}", pretty(raw));
  const ogPage = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
  await ogPage.setContent(ogHtml, { waitUntil: "networkidle" });
  await ogPage.evaluate(() => document.fonts.ready);
  const ogRaw = await ogPage.locator(".card").screenshot({ type: "png" });
  const ogPng = await sharp(ogRaw).png({ palette: true, quality: 90, compressionLevel: 9 }).toBuffer();
  const ogOut = join(here, "../../dashboard/app/start/opengraph-image.png");
  await writeFile(ogOut, ogPng);
  await writeFile(
    join(here, "../../dashboard/app/start/opengraph-image.alt.txt"),
    "SheTrades Digital: learn digital and business skills on WhatsApp. Send hi to " + pretty(raw) + "."
  );
  const ogMeta = await sharp(ogPng).metadata();
  const ogKb = Math.round(ogPng.length / 1024);
  if (ogPng.length > 300 * 1024) {
    console.error(`og image is ${ogKb} KB - over the ~300 KB WhatsApp will render. Simplify og.html.`);
    process.exitCode = 1;
  }

  const meta = await sharp(png).metadata();
  console.log(`link:  ${waLink}`);
  console.log(`print: ${base}.png  (${meta.width}x${meta.height})`);
  console.log(`share: ${base}-share.png  (1080 wide)`);
  console.log(`html:  ${base}.html`);
  console.log(`og:    ${ogOut}  (${ogMeta.width}x${ogMeta.height}, ${ogKb} KB)`);
} finally {
  await browser.close();
}
