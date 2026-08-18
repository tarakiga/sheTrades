import test from "node:test";
import assert from "node:assert/strict";
import {
  base32Decode,
  base32Encode,
  buildOtpAuthUri,
  decryptSecret,
  encryptSecret,
  generateTotpSecret,
  hotp,
  totp,
  totpEncryptionConfigured,
  verifyTotp
} from "./totp.js";

/**
 * The whole point of hand-rolling TOTP is that the RFCs publish test vectors,
 * so correctness is demonstrable rather than assumed. If these pass, the
 * implementation interoperates with Google Authenticator, Authy, 1Password etc.
 */

// RFC 4226 Appendix D — secret "12345678901234567890", counters 0..9.
const RFC4226_SECRET = Buffer.from("12345678901234567890", "ascii");
const RFC4226_EXPECTED = [
  "755224", "287082", "359152", "969429", "338314",
  "254676", "287922", "162583", "399871", "520489"
];

test("HOTP matches every RFC 4226 Appendix D test vector", () => {
  RFC4226_EXPECTED.forEach((expected, counter) => {
    assert.equal(hotp(RFC4226_SECRET, counter), expected, `counter ${counter}`);
  });
});

// RFC 6238 Appendix B — same ASCII secret, SHA1, 8 digits.
const RFC6238_SECRET_B32 = base32Encode(Buffer.from("12345678901234567890", "ascii"));
const RFC6238_VECTORS: Array<[number, string]> = [
  [59, "94287082"],
  [1111111109, "07081804"],
  [1111111111, "14050471"],
  [1234567890, "89005924"],
  [2000000000, "69279037"]
];

test("TOTP matches the RFC 6238 Appendix B test vectors (SHA1, 8 digits)", () => {
  for (const [seconds, expected] of RFC6238_VECTORS) {
    assert.equal(totp(RFC6238_SECRET_B32, seconds * 1000, 8), expected, `t=${seconds}`);
  }
});

test("base32 round-trips arbitrary bytes", () => {
  for (const sample of ["", "a", "ab", "abc", "abcd", "abcde", "hello world"]) {
    const buffer = Buffer.from(sample, "utf8");
    assert.deepEqual(base32Decode(base32Encode(buffer)), buffer, sample);
  }
});

test("base32Decode rejects characters outside the alphabet", () => {
  assert.throws(() => base32Decode("ABC!"), /Invalid base32/);
});

test("generateTotpSecret produces a decodable 160-bit secret", () => {
  const secret = generateTotpSecret();
  assert.equal(base32Decode(secret).length, 20);
  assert.notEqual(secret, generateTotpSecret(), "secrets must not repeat");
});

test("verifyTotp accepts the current code and reports its step", () => {
  const secret = generateTotpSecret();
  const now = 1_700_000_000_000;
  const code = totp(secret, now);
  const result = verifyTotp(secret, code, now);
  assert.equal(result.valid, true);
  assert.equal(typeof result.step, "number");
});

test("verifyTotp tolerates one step of drift either way but not two", () => {
  const secret = generateTotpSecret();
  const now = 1_700_000_000_000;
  const step = 30_000;
  assert.equal(verifyTotp(secret, totp(secret, now - step), now).valid, true, "one step behind");
  assert.equal(verifyTotp(secret, totp(secret, now + step), now).valid, true, "one step ahead");
  assert.equal(verifyTotp(secret, totp(secret, now - 2 * step), now).valid, false, "two behind is too far");
  assert.equal(verifyTotp(secret, totp(secret, now + 2 * step), now).valid, false, "two ahead is too far");
});

test("verifyTotp reports the matched step so callers can block replays", () => {
  const secret = generateTotpSecret();
  const now = 1_700_000_000_000;
  const first = verifyTotp(secret, totp(secret, now), now);
  const again = verifyTotp(secret, totp(secret, now), now);
  assert.equal(first.step, again.step, "the same code resolves to the same step both times");
});

test("verifyTotp rejects malformed input without touching the secret", () => {
  const secret = generateTotpSecret();
  const now = 1_700_000_000_000;
  for (const bad of ["", "12345", "1234567", "abcdef", "12 34 56 78"]) {
    assert.equal(verifyTotp(secret, bad, now).valid, false, `"${bad}" must be rejected`);
  }
});

test("verifyTotp ignores whitespace people paste in", () => {
  const secret = generateTotpSecret();
  const now = 1_700_000_000_000;
  const code = totp(secret, now);
  const spaced = `${code.slice(0, 3)} ${code.slice(3)}`;
  assert.equal(verifyTotp(secret, spaced, now).valid, true);
});

test("otpauth URI carries the fields an authenticator app needs", () => {
  const uri = buildOtpAuthUri({
    secretBase32: "JBSWY3DPEHPK3PXP",
    accountName: "admin@shetrades.digital",
    issuer: "SheTrades"
  });
  assert.match(uri, /^otpauth:\/\/totp\//);
  assert.match(uri, /secret=JBSWY3DPEHPK3PXP/);
  assert.match(uri, /issuer=SheTrades/);
  assert.match(uri, /period=30/);
  assert.match(uri, /digits=6/);
});

// --- Encryption at rest ---

const KEY_ENV = "TOTP_ENCRYPTION_KEY";
const TEST_KEY = Buffer.alloc(32, 7).toString("base64");

function withKey<T>(key: string | undefined, fn: () => T): T {
  const previous = process.env[KEY_ENV];
  if (key === undefined) delete process.env[KEY_ENV];
  else process.env[KEY_ENV] = key;
  try {
    return fn();
  } finally {
    if (previous === undefined) delete process.env[KEY_ENV];
    else process.env[KEY_ENV] = previous;
  }
}

test("secrets round-trip through encryption", () => {
  withKey(TEST_KEY, () => {
    const secret = generateTotpSecret();
    const sealed = encryptSecret(secret);
    assert.notEqual(sealed, secret, "the stored form must not be the plaintext");
    assert.ok(!sealed.includes(secret), "the plaintext must not appear in the stored form");
    assert.equal(decryptSecret(sealed), secret);
  });
});

test("encryption is non-deterministic, so equal secrets do not look equal at rest", () => {
  withKey(TEST_KEY, () => {
    const secret = generateTotpSecret();
    assert.notEqual(encryptSecret(secret), encryptSecret(secret));
  });
});

test("a tampered ciphertext fails authentication rather than decrypting to garbage", () => {
  withKey(TEST_KEY, () => {
    const sealed = encryptSecret(generateTotpSecret());
    const parts = sealed.split(":");
    const body = Buffer.from(parts[3]!, "base64");
    body[0] = body[0]! ^ 0xff;
    parts[3] = body.toString("base64");
    assert.throws(() => decryptSecret(parts.join(":")));
  });
});

test("decrypting under the wrong key fails", () => {
  const sealed = withKey(TEST_KEY, () => encryptSecret("JBSWY3DPEHPK3PXP"));
  withKey(Buffer.alloc(32, 9).toString("base64"), () => {
    assert.throws(() => decryptSecret(sealed));
  });
});

test("handling secrets without a configured key refuses rather than storing plaintext", () => {
  withKey(undefined, () => {
    assert.equal(totpEncryptionConfigured(), false);
    assert.throws(() => encryptSecret("JBSWY3DPEHPK3PXP"), /TOTP_ENCRYPTION_KEY/);
  });
});

test("a wrong-length key is rejected outright", () => {
  withKey(Buffer.alloc(16, 1).toString("base64"), () => {
    assert.equal(totpEncryptionConfigured(), false);
    assert.throws(() => encryptSecret("JBSWY3DPEHPK3PXP"), /32 bytes/);
  });
});

test("a hex-encoded key is accepted as well as base64", () => {
  withKey(Buffer.alloc(32, 3).toString("hex"), () => {
    assert.equal(totpEncryptionConfigured(), true);
    const sealed = encryptSecret("JBSWY3DPEHPK3PXP");
    assert.equal(decryptSecret(sealed), "JBSWY3DPEHPK3PXP");
  });
});
