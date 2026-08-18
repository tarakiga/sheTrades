import { Router, type Response } from "express";
import { prisma } from "../admin/prisma.js";
import { getRuntimeCertificateTemplate } from "../config-platform/runtime-config.js";
import { loadAssetFromDb } from "./assets.js";
import type { CertificateTemplatePayload } from "./contracts.js";
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
 * Two rules govern everything below and are worth stating once:
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
        revokedAt: true
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
 * throws on a missing asset or a malformed template. On an anonymous route
 * either would otherwise surface as an unhandled rejection, so both are caught
 * and logged HERE: the message names the real fault (an unset env var, a
 * missing asset key) and must never reach the visitor, who would learn about
 * this deployment's configuration from it.
 */
function sendServerError(res: Response, event: string, publicId: string, error: unknown): void {
  console.error(JSON.stringify({ event, publicId, reason: errorMessage(error) }));
  sendHtml(res, 500, UNAVAILABLE_HTML, "no-store");
}

export function createCertificatePublicRouter(overrides: Partial<CertificatePublicDeps> = {}): Router {
  const deps: CertificatePublicDeps = { ...defaultDeps, ...overrides };
  const router = Router();

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
      const template = deps.getTemplate();
      // NOT `template.enabled`, deliberately. That flag gates ISSUING new
      // certificates; a certificate that was legitimately issued must stay
      // verifiable even after an admin turns issuance off, or every credential
      // already in learners' hands breaks at once. Only the absence of a
      // template -- with nothing to render from -- is a refusal.
      if (!template) {
        sendNotFound(res);
        return;
      }

      const row = await deps.findByPublicId(publicId);
      if (!row) {
        sendNotFound(res);
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
        loadAsset: loadAssetFromDb
      });

      res.status(200);
      res.setHeader("Content-Type", "image/png");
      // A day. The artwork for an issued certificate never changes, and this
      // URL is fetched by Meta on every send and by every reader of the
      // verification page -- each miss costs a template parse, an asset read
      // and a full sharp composite.
      res.setHeader("Cache-Control", "public, max-age=86400");
      // Without this a caller that mistrusts our Content-Type could sniff the
      // bytes into something executable.
      res.setHeader("X-Content-Type-Options", "nosniff");
      res.setHeader("X-Robots-Tag", "noindex");
      res.send(png);
    } catch (error) {
      sendServerError(res, "certificate.public.png.failed", publicId, error);
    }
  });

  // Registered AFTER the .png route above -- see the comment there before
  // moving either of them.
  router.get("/c/:publicId", async (req, res) => {
    const publicId = req.params.publicId;
    try {
      const template = deps.getTemplate();
      // Same reasoning as the png route: `enabled` is not consulted here.
      if (!template) {
        sendNotFound(res);
        return;
      }

      const row = await deps.findByPublicId(publicId);
      if (!row) {
        sendNotFound(res);
        return;
      }

      const urls = certificateUrls(deps.baseUrl(), row.publicId);
      const html = buildVerifyPageHtml({
        learnerName: row.learnerName,
        programmeName: row.programmeName,
        // issuerName is the only field taken from the live template rather
        // than the frozen row: it names who is vouching TODAY, which is a
        // statement about the organisation, not about what was awarded.
        issuerName: template.issuerName,
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
