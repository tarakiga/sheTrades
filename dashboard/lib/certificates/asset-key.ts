/**
 * Turning a file somebody picked into a key the server will accept.
 *
 * The server's rule (backend/src/certificates/asset-upload.ts) is lowercase,
 * hyphens, 3 to 64 characters — and, more importantly, that a key which already
 * exists is REFUSED rather than overwritten, because issued certificates name
 * their artwork by key and replacing the bytes would redraw credentials already
 * in learners' hands.
 *
 * That rule is correct, and it is also the one most likely to be experienced as
 * an obstruction, so the editor does the versioning for the admin rather than
 * making them think about it: "CARE Logo (final).PNG" becomes
 * `logo-care-logo-final-v1`, and if that is taken, `-v2`.
 */

const MAX_KEY_LENGTH = 64;

/** Combining marks, so "Adeyemi" survives where the accented spelling would
 * otherwise lose the letters the marks sit on. Built from a string so the file
 * carries no non-ASCII of its own. */
const COMBINING_MARKS = new RegExp("[\\u0300-\\u036f]", "g");

/** Lowercase, hyphen-separated, with any run of other characters collapsed to a
 * single hyphen and the ends trimmed. */
export function slugify(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(COMBINING_MARKS, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** The version suffix on a key, incremented — the same rule the server applies
 * when it suggests one back after refusing a duplicate. */
export function nextVersion(key: string): string {
  const match = key.match(/^(.*?)-v(\d+)$/);
  if (!match) return `${key}-v2`;
  return `${match[1]}-v${Number(match[2]) + 1}`;
}

/**
 * A key for a newly picked file that does not collide with anything already
 * uploaded.
 *
 * Prefixed by kind so a list of twenty assets sorts into something legible, and
 * suffixed `-v1` from the outset so the versioning is visible before anyone
 * needs it, rather than appearing for the first time as a refusal.
 */
export function suggestAssetKey(input: {
  filename: string;
  kind: "background" | "logo";
  taken: ReadonlyArray<string>;
}): string {
  const stem = slugify(input.filename.replace(/\.[a-z0-9]+$/i, ""));
  const prefix = input.kind === "background" ? "certificate-background" : "logo";
  const base = stem && stem !== prefix ? `${prefix}-${stem}` : prefix;
  const taken = new Set(input.taken);

  let candidate = /-v\d+$/.test(base) ? base : `${base}-v1`;
  // Bounded rather than a while(true): a pathological set of existing keys
  // should hand back something the admin can edit, not spin.
  for (let attempt = 0; attempt < 100 && taken.has(candidate); attempt += 1) {
    candidate = nextVersion(candidate);
  }
  return candidate.slice(0, MAX_KEY_LENGTH).replace(/-+$/, "");
}
