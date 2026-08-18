import { createHash } from "node:crypto";
import { Router, type Request, type Response } from "express";
import { prisma } from "../admin/prisma.js";
import { getRuntimeCertificateTemplate } from "../config-platform/runtime-config.js";
import { loadAssetFromDb } from "./assets.js";
import {
  certificateTemplatePayloadSchema,
  type CertificateTemplatePayload
} from "./contracts.js";
import { escapeXml } from "./layout.js";
import { renderCertificatePng } from "./render.js";
import { certificateUrls } from "./service.js";

/**
 * The two PUBLIC certificate routes -- the only unauthenticated surface in
 * this feature, and the only place learner data is served to callers we know
 * nothing about.
 *
 *   GET /c/<id>.png  the artwork. This is the URL Meta itself fetches in
 *                    order to deliver the certificate into a WhatsApp chat,
 *                    so it must answer an anonymous GET with image bytes.
 *   GET /c/<id>      the verification page an employer opens.
 *
 * Three rules govern everything below and are worth stating once:
 *
 * 1. NOTHING about the learner beyond her name, her programme, the issue date
 *    and the issuing organisation may leave this module. Not her phone number,
 *    not her location, not her quiz scores, not her user id. A woman's
 *    performance record must not sit on a URL anyone can open. The narrow
 *    PublicCertificateRow type and the narrow `select` below are the
 *    enforcement, not a convention -- widening either is how that leaks.
 *
 * 2. Every refusal looks the same. An id that does not exist and a certificate
 *    we decline to show return byte-identical responses, so these URLs cannot
 *    be used as an oracle for "does this certificate id exist".
 *
 * 3. The artwork is rendered from the template FROZEN ON THE ROW, never from
 *    the live config document. Publishing a redesign must not reach back and
 *    restyle a credential a learner already holds and has already shared. The
 *    single exception -- issuerName on the verification page -- is marked at
 *    its call site with the reason it is one.
 *
 *    It follows that VERIFICATION OUTLIVES BOTH the template's `enabled` flag
 *    and the published document itself. A snapshotted certificate serves even
 *    when nothing is published, because it needs nothing that was unpublished.
 *    Withdrawing a certificate is revocation (Certificate.revokedAt), which is
 *    deliberate, visible on the page, and reversible -- not a side effect of
 *    config housekeeping.
 */

/**
 * Exactly the columns the public surface may see. Deliberately NOT
 * `Certificate` from @prisma/client: that type carries userId, revokedBy and
 * revokedReason, and a handler holding it is one autocomplete away from
 * putting one of them on an open page.
 */
export type PublicCertificateRow = {
  publicId: string;
  learnerName: string;
  programmeName: string;
  issuedAt: Date;
  revokedAt: Date | null;
  /**
   * The template frozen at issue time, and the reason this route no longer
   * renders from the live config document.
   *
   * Typed `unknown`, not CertificateTemplatePayload, ON PURPOSE. It arrives out
   * of a JSONB column: Prisma will hand back whatever bytes are in the row, and
   * a static type here would be a claim nobody checked. It is parsed before
   * use -- see resolveRenderTemplate.
   */
  templateSnapshot: unknown;
};

export type CertificatePublicDeps = {
  findByPublicId: (publicId: string) => Promise<PublicCertificateRow | null>;
  getTemplate: () => CertificateTemplatePayload | null;
  renderPng: typeof renderCertificatePng;
  baseUrl: () => string;
};

const defaultDeps: CertificatePublicDeps = {
  findByPublicId: (publicId) =>
    prisma.certificate.findUnique({
      where: { publicId },
      // Column-level allowlist. See rule 1 above: what is not selected cannot
      // be rendered, however this module is refactored later.
      select: {
        publicId: true,
        learnerName: true,
        programmeName: true,
        issuedAt: true,
        revokedAt: true,
        templateSnapshot: true
      }
    }),
  getTemplate: getRuntimeCertificateTemplate,
  renderPng: renderCertificatePng,
  // Read per request rather than captured at module load: the router is built
  // once at boot, and a value captured then would freeze whatever the env held
  // before configuration was applied.
  baseUrl: () => process.env.PUBLIC_BASE_URL ?? ""
};

/**
 * Formats the issue date for both the page and the artwork, in UTC.
 *
 * UTC and a fixed locale on purpose: the date printed on the certificate was
 * frozen when it was issued, and a verification page that renders it a day
 * earlier for a reader in Lagos than for one in Auckland reads as a
 * discrepancy between the page and the image it is vouching for.
 */
function formatIssuedDate(value: Date): string {
  return value.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC"
  });
}

export type VerifyPageInput = {
  learnerName: string;
  programmeName: string;
  issuerName: string;
  issuedAt: Date;
  revokedAt: Date | null;
  imageUrl: string;
};

/**
 * Styling is inline, hand-written and deliberately NOT drawn from the
 * dashboard's design system.
 *
 * This page is opened by strangers on unknown devices and networks, so it
 * loads nothing: no external stylesheet, no web font, no CDN, no JavaScript.
 * A verification page that depends on a third party is a verification page
 * that fails when that third party does -- and every request to one leaks the
 * fact that someone is checking this specific credential.
 *
 * No numeric literal here may run to seven or more consecutive digits; a test
 * asserts the finished page contains no phone-number-shaped string, and CSS
 * is the one place a false positive could come from.
 */
const PAGE_STYLE = `
    :root { color-scheme: light; }
    body {
      margin: 0;
      padding: 1.5rem 1rem 3rem;
      background: #f4f5f7;
      color: #1f2933;
      font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
      line-height: 1.5;
    }
    main {
      max-width: 40rem;
      margin: 0 auto;
      background: #ffffff;
      border: 1px solid #dfe3e8;
      border-radius: 0.75rem;
      padding: 1.5rem;
    }
    h1 { font-size: 1.25rem; margin: 0 0 1rem; }
    img {
      display: block;
      width: 100%;
      height: auto;
      border: 1px solid #dfe3e8;
      border-radius: 0.5rem;
      margin-bottom: 1.5rem;
    }
    dl { margin: 0; }
    dt {
      font-size: 0.8rem;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      color: #5c6670;
      margin-top: 1rem;
    }
    dd { margin: 0.15rem 0 0; font-size: 1.05rem; font-weight: 600; }
    .warning {
      margin: 0 0 1.5rem;
      padding: 0.9rem 1rem;
      border: 2px solid #b3261e;
      border-radius: 0.5rem;
      background: #fdecea;
      color: #7a1710;
      font-weight: 700;
    }
    footer { max-width: 40rem; margin: 1rem auto 0; font-size: 0.85rem; color: #5c6670; }
`;

/**
 * The verification page: the certificate image plus the four facts an
 * employer needs to trust it.
 *
 * Pure and exported so the privacy rule can be tested directly rather than
 * inferred from a route. Note what the signature does NOT accept -- no row, no
 * user, no id. It cannot leak a phone number because it is never handed one,
 * and that is the intended design, not an accident of the current call site.
 */
export function buildVerifyPageHtml(input: VerifyPageInput): string {
  const name = escapeXml(input.learnerName);
  const programme = escapeXml(input.programmeName);
  const issuer = escapeXml(input.issuerName);
  const issued = escapeXml(formatIssuedDate(input.issuedAt));
  const image = escapeXml(input.imageUrl);

  // Plain and prominent, and stated before the artwork rather than after it:
  // someone who reads only the top of the page must not come away believing a
  // withdrawn credential is live. The reason for the revocation is NOT shown --
  // it is an internal note that can describe the learner.
  const revokedBanner =
    input.revokedAt === null
      ? ""
      : `      <p class="warning" role="alert">This certificate was revoked on ${escapeXml(
          formatIssuedDate(input.revokedAt)
        )} and is no longer valid.</p>
`;

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <!-- The link is for people the learner chooses to give it to. Her name and
         programme have no business in a search index. -->
    <meta name="robots" content="noindex, noarchive">
    <title>Certificate verification</title>
    <style>${PAGE_STYLE}    </style>
  </head>
  <body>
    <main>
      <h1>Certificate verification</h1>
${revokedBanner}      <img src="${image}" alt="Completion certificate awarded to ${name}">
      <dl>
        <dt>Awarded to</dt>
        <dd>${name}</dd>
        <dt>Programme</dt>
        <dd>${programme}</dd>
        <dt>Issued on</dt>
        <dd>${issued}</dd>
        <dt>Issued by</dt>
        <dd>${issuer}</dd>
      </dl>
    </main>
    <footer>This page is the official record of this certificate.</footer>
  </body>
</html>
`;
}

/**
 * The one page every refusal returns.
 *
 * Built once, at module load, so both routes send the SAME string rather than
 * two strings that happen to agree today. See rule 2 at the top: a difference
 * in status, body or headers between "no such certificate" and "this
 * certificate exists but is withheld" turns these URLs into a probe.
 */
function buildNoticePageHtml(heading: string, message: string): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="robots" content="noindex, noarchive">
    <title>${escapeXml(heading)}</title>
    <style>${PAGE_STYLE}    </style>
  </head>
  <body>
    <main>
      <h1>${escapeXml(heading)}</h1>
      <p>${escapeXml(message)}</p>
    </main>
  </body>
</html>
`;
}

const NOT_FOUND_HTML = buildNoticePageHtml(
  "Certificate not found",
  "We could not find a certificate for this link. Please check the link and try again."
);

const UNAVAILABLE_HTML = buildNoticePageHtml(
  "Certificate unavailable",
  "This certificate could not be shown right now. Please try again later."
);

function sendHtml(res: Response, status: number, html: string, cacheControl: string): void {
  res.status(status);
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Cache-Control", cacheControl);
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Robots-Tag", "noindex");
  res.send(html);
}

/** One place the artwork response is built, so a cache hit and a fresh render
 * are byte-for-byte the same response rather than two that agree today. */
function sendPng(res: Response, png: Buffer): void {
  res.status(200);
  res.setHeader("Content-Type", "image/png");
  // A day. The artwork for an issued certificate never changes -- it is
  // rendered from the template frozen on the row -- and this URL is fetched by
  // Meta on every send and by every reader of the verification page. Only ever
  // a hint, though: Cloud Run puts no cache in front of this service, which is
  // why the in-process cache above exists at all.
  res.setHeader("Cache-Control", "public, max-age=86400");
  // Without this a caller that mistrusts our Content-Type could sniff the
  // bytes into something executable.
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Robots-Tag", "noindex");
  res.send(png);
}

/** Never varied per reason, never cached. A cached 404 would outlive the
 * unpublished template that caused it. */
function sendNotFound(res: Response): void {
  sendHtml(res, 404, NOT_FOUND_HTML, "no-store");
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Turns a thrown error into a 500 the public can read and an operator can
 * diagnose.
 *
 * certificateUrls() THROWS when PUBLIC_BASE_URL is unset, and renderCertificatePng()
 * throws on a missing asset or a malformed template.
 *
 * Uncaught, these do NOT become unhandled rejections -- express 5 awaits an
 * async handler and forwards a rejection to the app error handler. The risk is
 * the opposite one: that handler (src/app.ts) answers with
 * `res.json({ message: error.message })`, so the raw message would be served to
 * an anonymous caller -- which asset key is missing, which env var is unset,
 * the wording of this deployment's base-URL config. Catching HERE is what keeps
 * the operator-facing detail in the log and out of the response.
 */
function sendServerError(res: Response, event: string, publicId: string, error: unknown): void {
  console.error(JSON.stringify({ event, publicId, reason: errorMessage(error) }));
  sendHtml(res, 500, UNAVAILABLE_HTML, "no-store");
}

/**
 * Which template this certificate's artwork is drawn from: the one frozen onto
 * the row, NOT whatever is published today.
 *
 * This is the whole point of Certificate.templateSnapshot. A certificate is a
 * credential the learner keeps, shares and is judged on; publishing a redesign
 * -- new background, new partner logos, new layout, new fonts -- must not reach
 * back and restyle it. Reading the live document here is what made that happen,
 * and it is silent: nobody sees the old artwork disappear.
 *
 * PARSED, not cast. The snapshot is a JSONB column, so its shape is whatever
 * was written -- by this code, by a seed script, or by an older release. A
 * malformed one throws, and the caller turns that into a logged 500; rendering
 * from a half-valid template would produce a plausible-looking certificate that
 * is quietly wrong, which is worse (see render.ts).
 *
 * Returns null for the ONE case with nothing to draw from at all: a
 * pre-snapshot row at a moment when no template is published. Both routes turn
 * that into the ordinary not-found response.
 */
function resolveRenderTemplate(
  snapshot: unknown,
  liveTemplate: CertificateTemplatePayload | null
): CertificateTemplatePayload | null {
  // FALLBACK FOR PRE-SNAPSHOT ROWS ONLY -- not the normal path. The column is
  // nullable purely because rows written before it existed have to keep
  // rendering; every certificate issued since carries its own template, and a
  // NULL here means this row predates the freeze rather than that live lookup
  // is an acceptable default. Such a row is the only one whose verifiability
  // still depends on the live document, because it has nothing of its own.
  if (snapshot === null || snapshot === undefined) return liveTemplate;

  const parsed = certificateTemplatePayloadSchema.safeParse(snapshot);
  if (parsed.success) return parsed.data;

  const detail = parsed.error.issues
    .map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`)
    .join("; ");
  throw new Error(`certificate template snapshot is malformed: ${detail}`);
}

// -- Serving the artwork without re-rendering it -------------------------------
//
// GET /c/<id>.png is unauthenticated, about to be handed to Meta, and shared
// publicly by learners. Every uncached hit costs a row lookup, an asset read per
// image field, a QR rasterisation and several sharp composites -- on the same
// instance that serves the WhatsApp webhook and the admin login. The two guards
// below (cache the bytes, cap the renders per caller) exist so a few hundred
// concurrent viewers cannot take the rest of the service down with them.

/** Same shape as src/payouts/worker.ts: tunable per deployment, never zero, and
 * a junk value falls back rather than disabling the guard. */
function envInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

/**
 * Cache budget in BYTES, not entries.
 *
 * A certificate PNG is a full-bleed composite -- hundreds of KB, occasionally a
 * couple of MB -- so "keep N entries" is a memory limit nobody can predict.
 *
 * 32 MiB is ~6% of 512 MiB, which is what this service actually gets: no deploy
 * command in this repo passes `--memory`, so Cloud Run's default applies. The
 * budget has to stay small next to sharp's own working set during a render,
 * which is the real memory pressure on that instance and is what an OOM would
 * be attributed to. It still holds roughly 60 certificates at 500 KB each, and
 * the traffic here is bursty around individual certificates -- Meta fetches
 * one, then the learner shares that one link -- so a small cache catches nearly
 * every repeat a large one would. Raise CERTIFICATE_PNG_CACHE_MAX_BYTES with
 * the instance size, not on its own.
 */
const DEFAULT_CACHE_MAX_BYTES = 32 * 1024 * 1024;

type RenderCache = {
  get(key: string): Buffer | undefined;
  set(key: string, bytes: Buffer): void;
};

/**
 * Bytes already rendered, evicted oldest-first.
 *
 * Deliberately NOT an LRU: a hit does not reorder anything. The workload is a
 * burst of reads of the same few certificates, and FIFO is enough for that
 * while staying trivial to reason about under concurrency.
 */
function createRenderCache(maxBytes: number): RenderCache {
  // Map iterates in insertion order, which IS the eviction order here.
  const entries = new Map<string, Buffer>();
  let heldBytes = 0;

  return {
    get: (key) => entries.get(key),
    set: (key, bytes) => {
      if (entries.has(key)) return;
      // An artefact bigger than the whole budget would evict everything else in
      // order to store itself and then be evicted by the next write.
      if (bytes.byteLength > maxBytes) return;

      entries.set(key, bytes);
      heldBytes += bytes.byteLength;
      while (heldBytes > maxBytes) {
        const oldest = entries.keys().next();
        if (oldest.done) break;
        heldBytes -= entries.get(oldest.value)?.byteLength ?? 0;
        entries.delete(oldest.value);
      }
    }
  };
}

/**
 * Cache key: the certificate id plus a fingerprint of the template it is being
 * rendered from.
 *
 * The fingerprint is a hash of the resolved template rather than the row's
 * templateVersion, because the version does not cover the fallback path: a
 * pre-snapshot row renders from the LIVE template, and that document can be
 * republished under a version this row never recorded. Hashing what is actually
 * about to be drawn means a changed template can never serve bytes drawn from
 * the old one. Truncated to 16 hex characters -- this is a cache key, not a
 * security boundary, and a collision would have to be between two templates for
 * the same certificate id.
 */
function renderCacheKey(publicId: string, template: CertificateTemplatePayload): string {
  const fingerprint = createHash("sha256").update(JSON.stringify(template)).digest("hex").slice(0, 16);
  return `${publicId}:${fingerprint}`;
}

/** Requests per IP per window before the route starts refusing. Generous: this
 * is a fairness guard against one caller monopolising the render path, not an
 * access control. */
const DEFAULT_RATE_LIMIT = 60;
const DEFAULT_RATE_WINDOW_SECONDS = 60;

/**
 * Distinct callers tracked inside one window. At a few tens of bytes per entry
 * this is well under a megabyte, and hitting it means the traffic is broad
 * rather than concentrated -- which is not what this guard is for, so it stops
 * counting and lets everyone through (see below).
 */
const MAX_TRACKED_CALLERS = 10_000;

/**
 * A fixed-window counter per IP, in process.
 *
 * Deliberately NOT src/auth/throttle-store.ts. That machinery is keyed on an
 * account, persisted in Postgres, and escalates lockouts -- it is a security
 * control for a login, and every one of those properties is wrong here: this
 * endpoint has no account, a database write per image request would defeat the
 * purpose, and a caller who trips it is far more likely to be an over-eager
 * cache than an attacker.
 *
 * FAILS OPEN, everywhere. An unidentifiable caller, a full table, an unexpected
 * throw -- all return "allowed". Blocking Meta from fetching a certificate
 * image means the certificate is never delivered at all; serving a few extra
 * renders means a slower minute. The asymmetry is not close.
 *
 * Exported for tests: the fail-open branches are the ones that matter and none
 * of them is reachable through an HTTP request.
 */
export function createFixedWindowLimiter(
  limit: number,
  windowMs: number
): (key: string | undefined) => boolean {
  let windowStartedAt = Date.now();
  let counts = new Map<string, number>();

  return (key) => {
    try {
      // No usable client address (no proxy header, unusual transport). Bucketing
      // these together would let one such caller throttle all of them.
      if (!key) return true;

      const now = Date.now();
      if (now - windowStartedAt >= windowMs) {
        // Whole-window reset rather than per-entry expiry: it reclaims the map
        // in one step and keeps the counter free of timestamps.
        windowStartedAt = now;
        counts = new Map();
      }

      const used = counts.get(key) ?? 0;
      if (used === 0 && counts.size >= MAX_TRACKED_CALLERS) return true;
      if (used >= limit) return false;
      counts.set(key, used + 1);
      return true;
    } catch {
      return true;
    }
  };
}

/**
 * The caller this request is charged to. `trust proxy` is set to 1 in app.ts,
 * so on Cloud Run this is the client address from X-Forwarded-For.
 *
 * Undefined is a real outcome and is handled as "do not count", not as a shared
 * bucket -- see the limiter.
 */
function callerKey(req: Request): string | undefined {
  const ip = req.ip;
  return typeof ip === "string" && ip.length > 0 ? ip : undefined;
}

function sendTooManyRequests(res: Response, retryAfterSeconds: number): void {
  res.status(429);
  res.setHeader("Retry-After", String(retryAfterSeconds));
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  res.setHeader("X-Robots-Tag", "noindex");
  res.send("Too many requests. Please try again shortly.");
}

export function createCertificatePublicRouter(overrides: Partial<CertificatePublicDeps> = {}): Router {
  const deps: CertificatePublicDeps = { ...defaultDeps, ...overrides };
  const router = Router();

  // Per-router rather than per-module, so the process-wide state belongs to the
  // one router the app mounts and a test can build an isolated one.
  const renderCache = createRenderCache(
    envInt("CERTIFICATE_PNG_CACHE_MAX_BYTES", DEFAULT_CACHE_MAX_BYTES)
  );
  const rateWindowSeconds = envInt("CERTIFICATE_PNG_RATE_WINDOW_SECONDS", DEFAULT_RATE_WINDOW_SECONDS);
  const allowRender = createFixedWindowLimiter(
    envInt("CERTIFICATE_PNG_RATE_LIMIT", DEFAULT_RATE_LIMIT),
    rateWindowSeconds * 1000
  );

  /**
   * REGISTRATION ORDER IS LOAD-BEARING. The .png route MUST stay above the
   * bare route below.
   *
   * Express matches in registration order and ":publicId" happily matches a
   * string containing a dot, so with these two swapped a request for
   * "/c/<id>.png" is answered by the HTML handler with publicId "<id>.png" --
   * which then finds no such certificate and 404s. Verified against
   * express 5.2.1 / path-to-regexp 8 in this order (png handler, publicId
   * "<id>") and reversed (html handler, publicId "<id>.png").
   *
   * The failure mode is that certificates simply stop being delivered:
   * Meta fetches this URL to attach the image to a WhatsApp message, gets a
   * 404, and the send fails. Please do not sort these two alphabetically.
   */
  router.get("/c/:publicId.png", async (req, res) => {
    const publicId = req.params.publicId;
    try {
      // Charged BEFORE the database is touched, which is the point: the guard
      // exists to keep a flood off Postgres and sharp, so it cannot sit behind
      // either of them. The consequence is that a cache HIT still consumes
      // budget -- the cache key is derived from the row, so there is no way to
      // know a request is a hit without the lookup this check is protecting.
      if (!allowRender(callerKey(req))) {
        sendTooManyRequests(res, rateWindowSeconds);
        return;
      }

      const row = await deps.findByPublicId(publicId);
      if (!row) {
        sendNotFound(res);
        return;
      }

      /**
       * VERIFICATION OUTLIVES THE CONFIG DOCUMENT.
       *
       * `template.enabled` is not consulted here -- that flag gates ISSUING,
       * and a certificate legitimately issued must stay verifiable after an
       * admin turns issuance off, or every credential already in learners'
       * hands breaks at once. Unpublishing the document is the same act with a
       * different lever, so it gets the same answer: a row carrying its own
       * snapshot serves whether or not anything is published, because the live
       * document is irrelevant to it. Only a pre-snapshot row -- which
       * genuinely has nothing to render from -- still depends on one.
       *
       * Withdrawing a certificate is REVOCATION: Certificate.revokedAt, which
       * the verification page states plainly and an admin does deliberately.
       * Do not reinstate a coupling that lets routine config housekeeping
       * silently break credentials people are being judged on.
       */
      const template = resolveRenderTemplate(row.templateSnapshot, deps.getTemplate());
      if (!template) {
        sendNotFound(res);
        return;
      }

      const cacheKey = renderCacheKey(row.publicId, template);
      const cached = renderCache.get(cacheKey);
      if (cached) {
        sendPng(res, cached);
        return;
      }

      // A revoked certificate still renders. The page it backs says plainly
      // that it is no longer valid; a broken image there would look like a
      // fault in the verification page rather than a judgement about the
      // credential.
      const urls = certificateUrls(deps.baseUrl(), row.publicId);
      const png = await deps.renderPng({
        template,
        values: {
          learnerName: row.learnerName,
          // From the ROW, not from the template: the programme name recorded
          // at issue time is what this learner was certified in, even if the
          // template has since been renamed.
          programmeName: row.programmeName,
          issuedDate: formatIssuedDate(row.issuedAt),
          certificateId: row.publicId
        },
        verifyUrl: urls.verify,
        // Resolves the asset KEYS carried by the snapshot to bytes. Those keys
        // must be treated as immutable -- see the note in assets.ts, which is
        // what keeps the snapshot meaningful.
        loadAsset: loadAssetFromDb
      });

      // Stored only after a successful render: a throw above must not be
      // cached, and there is nothing to cache from one anyway.
      renderCache.set(cacheKey, png);
      sendPng(res, png);
    } catch (error) {
      sendServerError(res, "certificate.public.png.failed", publicId, error);
    }
  });

  // Registered AFTER the .png route above -- see the comment there before
  // moving either of them.
  router.get("/c/:publicId", async (req, res) => {
    const publicId = req.params.publicId;
    try {
      const row = await deps.findByPublicId(publicId);
      if (!row) {
        sendNotFound(res);
        return;
      }

      // The same gate as the png route, through the same resolver on purpose:
      // the two routes must never disagree about whether a certificate is
      // showable, or the page becomes the more permissive surface and starts
      // vouching for an image that 404s. See the png route for why an
      // unpublished template does not withhold a snapshotted certificate.
      const liveTemplate = deps.getTemplate();
      const template = resolveRenderTemplate(row.templateSnapshot, liveTemplate);
      if (!template) {
        sendNotFound(res);
        return;
      }

      const urls = certificateUrls(deps.baseUrl(), row.publicId);
      const html = buildVerifyPageHtml({
        learnerName: row.learnerName,
        programmeName: row.programmeName,
        // THE ONE INTENTIONAL EXCEPTION to the snapshot rule, and the only
        // value on this page that does not come from the row: issuerName names
        // who is vouching for this credential TODAY. That is a statement about
        // the organisation, not part of what was awarded -- a rename or a
        // transfer of the programme should show up on every verification page
        // at once. Everything the ARTWORK says is frozen (see the png route);
        // this line is not an oversight, and reading it from
        // row.templateSnapshot by preference would be a behaviour change.
        //
        // It falls back to the FROZEN issuer only when nothing is published --
        // graceful degradation, not a policy change. A live value when there is
        // one, the value this certificate was issued under otherwise, and never
        // a blank where the issuer should be.
        issuerName: liveTemplate?.issuerName ?? template.issuerName,
        issuedAt: row.issuedAt,
        revokedAt: row.revokedAt,
        imageUrl: urls.image
      });

      // Short, not a day: revocation must take effect for a reader quickly.
      // The heavy artefact behind this page -- the PNG -- carries the long
      // cache instead.
      sendHtml(res, 200, html, "public, max-age=300");
    } catch (error) {
      sendServerError(res, "certificate.public.page.failed", publicId, error);
    }
  });

  return router;
}

export const certificatePublicRouter = createCertificatePublicRouter();
