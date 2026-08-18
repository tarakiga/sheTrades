/**
 * TOTP (RFC 6238) over HOTP (RFC 4226), plus at-rest encryption for the shared
 * secrets. Implemented directly rather than pulled from a dependency: the spec
 * is small and fully specified, and the RFC publishes test vectors, so the
 * implementation can be proven correct rather than trusted.
 *
 * See totp.test.ts — it asserts against the RFC 6238 Appendix B vectors.
 */
import { createCipheriv, createDecipheriv, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

/** RFC 4648 base32, unpadded — the encoding authenticator apps expect. */
export function base32Encode(buffer: Buffer): string {
  let bits = 0;
  let value = 0;
  let output = "";
  for (const byte of buffer) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  return output;
}

export function base32Decode(input: string): Buffer {
  const cleaned = input.replace(/=+$/, "").replace(/\s/g, "").toUpperCase();
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];
  for (const char of cleaned) {
    const index = BASE32_ALPHABET.indexOf(char);
    if (index === -1) throw new Error("Invalid base32 character in TOTP secret.");
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

/** A new 160-bit secret — the size RFC 4226 recommends for HMAC-SHA1. */
export function generateTotpSecret(): string {
  return base32Encode(randomBytes(20));
}

/** HOTP (RFC 4226): truncate an HMAC of the counter down to `digits`. */
export function hotp(secret: Buffer, counter: number, digits = 6): string {
  const counterBuffer = Buffer.alloc(8);
  // 64-bit big-endian counter written as two 32-bit halves, so this stays
  // correct past 2^32 without reaching for BigInt.
  counterBuffer.writeUInt32BE(Math.floor(counter / 0x100000000), 0);
  counterBuffer.writeUInt32BE(counter >>> 0, 4);

  const digest = createHmac("sha1", secret).update(counterBuffer).digest();
  const offset = digest[digest.length - 1]! & 0x0f;
  const binary =
    ((digest[offset]! & 0x7f) << 24) |
    ((digest[offset + 1]! & 0xff) << 16) |
    ((digest[offset + 2]! & 0xff) << 8) |
    (digest[offset + 3]! & 0xff);
  return (binary % Math.pow(10, digits)).toString().padStart(digits, "0");
}

export const TOTP_PERIOD_SECONDS = 30;

/** Which 30-second step a moment falls in. */
export function totpStep(atMs: number, periodSeconds = TOTP_PERIOD_SECONDS): number {
  return Math.floor(atMs / 1000 / periodSeconds);
}

export function totp(secretBase32: string, atMs: number, digits = 6): string {
  return hotp(base32Decode(secretBase32), totpStep(atMs), digits);
}

/**
 * Verify a submitted code, tolerating `window` steps of clock drift either way.
 * Returns the matched step so the caller can reject replays — without that, a
 * code stays usable for its whole window by anyone who observes it.
 */
export function verifyTotp(
  secretBase32: string,
  code: string,
  atMs: number,
  options: { window?: number; digits?: number } = {}
): { valid: boolean; step: number | null } {
  const window = options.window ?? 1;
  const digits = options.digits ?? 6;
  const submitted = code.replace(/\s/g, "");
  // Escape-free digit check: a stringly-built RegExp here is easy to get subtly
  // wrong (and did), and a wrong one silently rejects every valid code.
  const allDigits =
    submitted.length === digits && Array.from(submitted).every((c) => c >= "0" && c <= "9");
  if (!allDigits) return { valid: false, step: null };

  const secret = base32Decode(secretBase32);
  const current = totpStep(atMs);
  for (let offset = -window; offset <= window; offset++) {
    const step = current + offset;
    if (step < 0) continue;
    const expected = hotp(secret, step, digits);
    // Lengths are equal by construction above, so timingSafeEqual is safe here.
    if (timingSafeEqual(Buffer.from(expected), Buffer.from(submitted))) {
      return { valid: true, step };
    }
  }
  return { valid: false, step: null };
}

/** The otpauth:// URI an authenticator app scans. */
export function buildOtpAuthUri(params: {
  secretBase32: string;
  accountName: string;
  issuer: string;
}): string {
  const label = encodeURIComponent(params.issuer + ":" + params.accountName);
  const query = new URLSearchParams({
    secret: params.secretBase32,
    issuer: params.issuer,
    algorithm: "SHA1",
    digits: "6",
    period: String(TOTP_PERIOD_SECONDS)
  });
  return "otpauth://totp/" + label + "?" + query.toString();
}

// --- Encryption at rest -----------------------------------------------------
// A TOTP secret is a bearer credential: anyone holding it can mint valid codes
// forever. Stored in plaintext, a database leak silently defeats 2FA for every
// admin, so secrets are sealed with AES-256-GCM under a key that lives in
// Secret Manager rather than in the database beside them.

const ENC_PREFIX = "gcm";

function encryptionKey(): Buffer {
  const raw = process.env.TOTP_ENCRYPTION_KEY?.trim();
  if (!raw) {
    throw new Error(
      "TOTP_ENCRYPTION_KEY is not configured - refusing to handle TOTP secrets without at-rest encryption."
    );
  }
  const key = /^[0-9a-fA-F]{64}$/.test(raw) ? Buffer.from(raw, "hex") : Buffer.from(raw, "base64");
  if (key.length !== 32) {
    throw new Error("TOTP_ENCRYPTION_KEY must decode to exactly 32 bytes (AES-256).");
  }
  return key;
}

/** True when at-rest encryption is available, so callers can degrade cleanly. */
export function totpEncryptionConfigured(): boolean {
  try {
    encryptionKey();
    return true;
  } catch {
    return false;
  }
}

export function encryptSecret(plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const sealed = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [ENC_PREFIX, iv.toString("base64"), tag.toString("base64"), sealed.toString("base64")].join(":");
}

export function decryptSecret(stored: string): string {
  const parts = stored.split(":");
  if (parts.length !== 4 || parts[0] !== ENC_PREFIX) {
    throw new Error("Stored TOTP secret is not in the expected encrypted format.");
  }
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(parts[1]!, "base64"));
  decipher.setAuthTag(Buffer.from(parts[2]!, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(parts[3]!, "base64")), decipher.final()]).toString("utf8");
}
