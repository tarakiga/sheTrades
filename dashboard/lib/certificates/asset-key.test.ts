import test from "node:test";
import assert from "node:assert/strict";

import { nextVersion, slugify, suggestAssetKey } from "./asset-key.js";

test("slugify lowercases, hyphenates and trims", () => {
  assert.equal(slugify("CARE Logo (final).PNG"), "care-logo-final-png");
  assert.equal(slugify("  spaced  out  "), "spaced-out");
  assert.equal(slugify("___"), "");
});

test("accented letters survive as their base letters", () => {
  // Stripping the whole character instead of the mark would silently turn
  // "Adeyemi" into "adym".
  assert.equal(slugify("Adeyemi"), "adeyemi");
  assert.equal(slugify("Olá Adéyẹ́mí"), "ola-adeyemi");
});

test("a suggested key is prefixed by kind and versioned from the start", () => {
  assert.equal(
    suggestAssetKey({ filename: "TechHer.png", kind: "logo", taken: [] }),
    "logo-techher-v1"
  );
  assert.equal(
    suggestAssetKey({ filename: "final artwork.png", kind: "background", taken: [] }),
    "certificate-background-final-artwork-v1"
  );
});

test("a suggestion steps past keys already taken", () => {
  // The server refuses a duplicate outright, because an issued certificate's
  // frozen snapshot names its artwork by key. Better to hand over a free one
  // than to let the upload fail.
  const key = suggestAssetKey({
    filename: "TechHer.png",
    kind: "logo",
    taken: ["logo-techher-v1", "logo-techher-v2"]
  });
  assert.equal(key, "logo-techher-v3");
});

test("a filename that already carries a version keeps it rather than doubling up", () => {
  assert.equal(
    suggestAssetKey({ filename: "techher-v4.png", kind: "logo", taken: [] }),
    "logo-techher-v4"
  );
});

test("a filename with nothing usable still yields a valid key", () => {
  assert.equal(suggestAssetKey({ filename: "___.png", kind: "logo", taken: [] }), "logo-v1");
  assert.equal(
    suggestAssetKey({ filename: ".png", kind: "background", taken: [] }),
    "certificate-background-v1"
  );
});

test("nextVersion increments, or adds, a trailing version", () => {
  assert.equal(nextVersion("logo-care-v1"), "logo-care-v2");
  assert.equal(nextVersion("logo-care-v9"), "logo-care-v10");
  assert.equal(nextVersion("logo-care"), "logo-care-v2");
});

test("a very long filename is cut to the length the server accepts", () => {
  const key = suggestAssetKey({ filename: `${"a".repeat(200)}.png`, kind: "logo", taken: [] });
  assert.ok(key.length <= 64);
  assert.ok(/^[a-z0-9][a-z0-9-]*[a-z0-9]$/.test(key), key);
});
