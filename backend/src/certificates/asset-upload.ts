/**
 * What a certificate asset upload has to satisfy before any bytes are stored.
 *
 * Pure on purpose: every rule here is a decision, and decisions are worth
 * testing without a database, an HTTP request or an image decoder in the way.
 * The route supplies the facts (declared type, byte length, what sharp actually
 * decoded, whether the key is taken) and this module supplies the verdict.
 *
 * The rule that matters most is the one about KEYS, and it is not a validation
 * detail -- it is what keeps issued credentials honest. See `assets.ts`: a
 * certificate row freezes its whole template, but the snapshot refers to
 * artwork by key, not by bytes. Letting an admin re-upload over
 * `certificate-background-v1` would redraw certificates already in learners'
 * hands, months after they were issued, with no record that anything changed.
 * So an upload to an existing key is refused rather than merged, and new
 * artwork means a new key.
 */

/** Declared content types an admin may upload, mapped to the format sharp must
 * agree it actually decoded. SVG is allowed because partner marks arrive as
 * vector more often than not; it is rasterised before compositing (see
 * render.ts) so it never reaches the layer carrying learner data. */
export const ALLOWED_ASSET_MIME: ReadonlyMap<string, string> = new Map([
  ["image/png", "png"],
  ["image/jpeg", "jpeg"],
  ["image/svg+xml", "svg"]
]);

/** 5 MiB. Generous for a print-resolution background, and small enough that a
 * mistaken upload of somebody's raw camera roll fails fast rather than sitting
 * in a Postgres bytea column forever. */
export const MAX_ASSET_BYTES = 5 * 1024 * 1024;

export type CertificateAssetKind = "background" | "logo";

/**
 * Minimum dimensions, per kind.
 *
 * A background below 800x600 is upscaled to print resolution and reaches the
 * learner visibly soft -- a credential is the last place to discover that. A
 * 32px floor on logos catches the favicon-instead-of-the-logo mistake, which
 * otherwise renders as an unreadable smudge beside a partner's name.
 */
export const MIN_ASSET_DIMENSIONS: Readonly<
  Record<CertificateAssetKind, { width: number; height: number }>
> = {
  background: { width: 800, height: 600 },
  logo: { width: 32, height: 32 }
};

/**
 * Lowercase, hyphen-separated, no underscores or capitals.
 *
 * Not fussiness: the key is typed into template JSON, appears in URLs, and is
 * compared exactly. A scheme admitting `Cert_BG` and `cert-bg` as different
 * keys for the same picture produces a template referencing artwork nobody can
 * find, and the failure surfaces at render time on somebody's certificate.
 */
export const ASSET_KEY_PATTERN = /^[a-z0-9][a-z0-9-]{1,62}[a-z0-9]$/;

export type AssetUploadFacts = {
  key: string;
  kind: CertificateAssetKind;
  /** The Content-Type the client declared. Checked, then corroborated. */
  declaredMime: string;
  byteLength: number;
  /** What sharp decoded the bytes as -- `undefined` when it could not decode
   * them at all, which is itself a rejection. */
  detectedFormat: string | undefined;
  width: number;
  height: number;
  /** Whether an asset already exists under this key. */
  keyTaken: boolean;
};

export type AssetUploadVerdict = { ok: true } | { ok: false; reason: string; status: 400 | 409 };

export function validateAssetUpload(facts: AssetUploadFacts): AssetUploadVerdict {
  if (!ASSET_KEY_PATTERN.test(facts.key)) {
    return {
      ok: false,
      status: 400,
      reason:
        "Use a lowercase name with hyphens, 3 to 64 characters, for example certificate-background-v2."
    };
  }

  // Checked before anything is decoded: replacing artwork under a live key is
  // not a validation slip an admin should be able to force past.
  if (facts.keyTaken) {
    return {
      ok: false,
      status: 409,
      reason:
        "An asset named " +
        facts.key +
        " already exists. Artwork is never replaced in place, because certificates already issued still point at it. Upload this as a new version instead, for example " +
        suggestNextKey(facts.key) +
        "."
    };
  }

  if (facts.byteLength <= 0) {
    return { ok: false, status: 400, reason: "The uploaded file is empty." };
  }

  if (facts.byteLength > MAX_ASSET_BYTES) {
    return {
      ok: false,
      status: 400,
      reason:
        "That file is " +
        formatMebibytes(facts.byteLength) +
        ". The limit is " +
        formatMebibytes(MAX_ASSET_BYTES) +
        "."
    };
  }

  const declared = facts.declaredMime.toLowerCase().split(";")[0]?.trim() ?? "";
  const expectedFormat = ALLOWED_ASSET_MIME.get(declared);
  if (!expectedFormat) {
    return {
      ok: false,
      status: 400,
      reason:
        (facts.declaredMime || "That file type") +
        " cannot be used. Upload a PNG, a JPEG, or an SVG."
    };
  }

  // The declared type is a claim by the client; what sharp reads out of the
  // bytes is evidence. They have to agree, so a file cannot be stored under a
  // type it will not later be served as.
  if (!facts.detectedFormat) {
    return { ok: false, status: 400, reason: "That file could not be read as an image." };
  }
  if (facts.detectedFormat !== expectedFormat) {
    return {
      ok: false,
      status: 400,
      reason:
        "The file was sent as " +
        facts.declaredMime +
        " but its contents are " +
        facts.detectedFormat +
        "."
    };
  }

  const minimum = MIN_ASSET_DIMENSIONS[facts.kind];
  if (!(facts.width > 0) || !(facts.height > 0)) {
    return { ok: false, status: 400, reason: "That image has no readable dimensions." };
  }
  if (facts.width < minimum.width || facts.height < minimum.height) {
    return {
      ok: false,
      status: 400,
      reason:
        "A " +
        facts.kind +
        " must be at least " +
        minimum.width +
        "x" +
        minimum.height +
        " pixels. This one is " +
        facts.width +
        "x" +
        facts.height +
        "."
    };
  }

  return { ok: true };
}

/**
 * The next key an admin probably wants, so the refusal above arrives with the
 * answer attached rather than just a rule.
 *
 * `certificate-background-v1` becomes `certificate-background-v2`; a key with no
 * trailing version gains `-v2`, because the unsuffixed key is version one
 * whether or not it says so.
 */
export function suggestNextKey(key: string): string {
  const match = /^(.*?)-v(\d+)$/.exec(key);
  if (!match) return key + "-v2";
  return match[1] + "-v" + String(Number(match[2]) + 1);
}

function formatMebibytes(bytes: number): string {
  return (bytes / (1024 * 1024)).toFixed(1) + " MB";
}
