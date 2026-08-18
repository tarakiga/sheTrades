import test from "node:test";
import assert from "node:assert/strict";
import {
  MAX_ASSET_BYTES,
  suggestNextKey,
  validateAssetUpload,
  type AssetUploadFacts
} from "./asset-upload.js";

function facts(overrides: Partial<AssetUploadFacts> = {}): AssetUploadFacts {
  return {
    key: "certificate-background-v2",
    kind: "background",
    declaredMime: "image/png",
    byteLength: 400_000,
    detectedFormat: "png",
    width: 2048,
    height: 1450,
    keyTaken: false,
    ...overrides
  };
}

test("a well-formed background upload is accepted", () => {
  assert.deepEqual(validateAssetUpload(facts()), { ok: true });
});

test("a charset parameter on the content type does not defeat the allowlist", () => {
  // Browsers and fetch happily append one; rejecting on the raw string would
  // fail an upload that is in every respect valid.
  assert.deepEqual(validateAssetUpload(facts({ declaredMime: "image/png; charset=binary" })), {
    ok: true
  });
});

test("an existing key is refused rather than overwritten", () => {
  // The property this protects: an issued certificate's frozen snapshot names
  // its artwork by key. Replacing the bytes would redraw credentials already
  // delivered.
  const verdict = validateAssetUpload(facts({ key: "certificate-background-v1", keyTaken: true }));
  assert.equal(verdict.ok, false);
  assert.equal(verdict.ok === false && verdict.status, 409);
  assert.match(
    verdict.ok === false ? verdict.reason : "",
    /certificate-background-v2/,
    "the refusal should suggest the next free key"
  );
});

test("the key collision is checked before the file itself", () => {
  // Otherwise an admin fixes a size complaint, uploads again, and only then
  // discovers the key was never available.
  const verdict = validateAssetUpload(
    facts({ key: "certificate-background-v1", keyTaken: true, byteLength: MAX_ASSET_BYTES + 1 })
  );
  assert.equal(verdict.ok === false && verdict.status, 409);
});

test("keys must be lowercase and hyphenated", () => {
  for (const key of ["Cert_BG", "cert bg", "ab", "CERT-BG", "cert-bg-", "-cert-bg"]) {
    const verdict = validateAssetUpload(facts({ key }));
    assert.equal(verdict.ok, false, `${key} should be rejected`);
  }
  assert.equal(validateAssetUpload(facts({ key: "logo-techher-v3" })).ok, true);
});

test("the size cap is exclusive at one byte over", () => {
  assert.equal(validateAssetUpload(facts({ byteLength: MAX_ASSET_BYTES })).ok, true);
  const over = validateAssetUpload(facts({ byteLength: MAX_ASSET_BYTES + 1 }));
  assert.equal(over.ok, false);
  assert.match(over.ok === false ? over.reason : "", /5\.0 MB/);
});

test("an empty body is rejected", () => {
  assert.equal(validateAssetUpload(facts({ byteLength: 0 })).ok, false);
});

test("disallowed content types are rejected", () => {
  for (const declaredMime of ["image/gif", "application/pdf", "text/html", ""]) {
    assert.equal(validateAssetUpload(facts({ declaredMime })).ok, false, declaredMime);
  }
});

test("the declared type must match what the bytes actually decode as", () => {
  // The header is a claim by the client. Storing a JPEG under image/png would
  // later serve it with a Content-Type its bytes contradict.
  const verdict = validateAssetUpload(facts({ declaredMime: "image/png", detectedFormat: "jpeg" }));
  assert.equal(verdict.ok, false);
  assert.match(verdict.ok === false ? verdict.reason : "", /contents are jpeg/);
});

test("bytes that decode as nothing are rejected", () => {
  assert.equal(validateAssetUpload(facts({ detectedFormat: undefined })).ok, false);
});

test("svg is allowed when the bytes agree", () => {
  assert.equal(
    validateAssetUpload(
      facts({ kind: "logo", declaredMime: "image/svg+xml", detectedFormat: "svg", width: 512, height: 512 })
    ).ok,
    true
  );
});

test("minimum dimensions differ by kind", () => {
  // 400x300 is far too small to be a background but perfectly reasonable as a
  // partner logo, so one global floor would either reject good logos or admit
  // blurred backgrounds.
  assert.equal(validateAssetUpload(facts({ kind: "background", width: 400, height: 300 })).ok, false);
  assert.equal(validateAssetUpload(facts({ kind: "logo", width: 400, height: 300 })).ok, true);
  assert.equal(validateAssetUpload(facts({ kind: "logo", width: 16, height: 16 })).ok, false);
});

test("degenerate dimensions are caught rather than passed through", () => {
  assert.equal(validateAssetUpload(facts({ width: 0, height: 0 })).ok, false);
  assert.equal(validateAssetUpload(facts({ width: Number.NaN, height: 1450 })).ok, false);
});

test("suggestNextKey increments a trailing version, or adds one", () => {
  assert.equal(suggestNextKey("certificate-background-v1"), "certificate-background-v2");
  assert.equal(suggestNextKey("logo-care-v9"), "logo-care-v10");
  assert.equal(suggestNextKey("logo-care"), "logo-care-v2");
});
