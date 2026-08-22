import test from "node:test";
import assert from "node:assert/strict";

import {
  developmentOnlyRoutesEnabled,
  isDevelopmentOnlyPath,
  normaliseHost,
  parseAdminHosts,
  surfaceForHost,
  verdictForPublicRequest
} from "./hosts.js";

const ADMIN_HOSTS = parseAdminHosts("admin.shetrades.digital");

test("normaliseHost lowercases and drops the port", () => {
  assert.equal(normaliseHost("Admin.SheTrades.Digital:443"), "admin.shetrades.digital");
  assert.equal(normaliseHost("localhost:3000"), "localhost");
});

test("normaliseHost keeps a bracketed IPv6 literal intact", () => {
  // The port is the colon AFTER the closing bracket, so splitting on the first
  // colon would leave "[" and classify the host as unknown.
  assert.equal(normaliseHost("[::1]:3000"), "[::1]");
  assert.equal(normaliseHost("[::1]"), "[::1]");
});

test("normaliseHost tolerates a missing Host header", () => {
  assert.equal(normaliseHost(null), "");
  assert.equal(normaliseHost(undefined), "");
  assert.equal(normaliseHost("   "), "");
});

test("parseAdminHosts trims, lowercases, and drops blanks", () => {
  assert.deepEqual(parseAdminHosts(" Admin.Example.com , ,console.example.com "), [
    "admin.example.com",
    "console.example.com"
  ]);
  assert.deepEqual(parseAdminHosts(""), []);
  assert.deepEqual(parseAdminHosts(undefined), []);
});

test("parseAdminHosts accepts full origins, not just bare hosts", () => {
  // The CORS setting next door takes origins, so this format will get pasted.
  // Unstripped it would parse to the host "https" and quietly publish the console.
  assert.deepEqual(parseAdminHosts("https://admin.shetrades.digital/"), [
    "admin.shetrades.digital"
  ]);
});

test("the configured admin host is the console", () => {
  assert.equal(surfaceForHost("admin.shetrades.digital", ADMIN_HOSTS), "admin");
});

test("the customer-facing domains are public", () => {
  assert.equal(surfaceForHost("www.shetrades.digital", ADMIN_HOSTS), "public");
  assert.equal(surfaceForHost("shetrades.digital", ADMIN_HOSTS), "public");
});

test("vercel.app hostnames stay admin even with nothing configured", () => {
  // Vercel always serves the project there and the hostnames cannot be removed,
  // so this is what stops a DNS mistake locking the team out of their console.
  assert.equal(surfaceForHost("she-trades.vercel.app", []), "admin");
  assert.equal(surfaceForHost("she-trades-git-main-tars-projects.vercel.app", []), "admin");
});

test("local development is the console", () => {
  assert.equal(surfaceForHost("localhost:3000", []), "admin");
  assert.equal(surfaceForHost("127.0.0.1:3000", []), "admin");
  assert.equal(surfaceForHost("[::1]:3000", []), "admin");
});

test("an unrecognised host is public, not admin", () => {
  // Least privilege: an unset ADMIN_HOSTS must degrade to "the split still
  // holds", never to "the console is reachable again".
  assert.equal(surfaceForHost("www.shetrades.digital", []), "public");
  assert.equal(surfaceForHost("some-host-nobody-configured.example", ADMIN_HOSTS), "public");
  assert.equal(surfaceForHost(null, ADMIN_HOSTS), "public");
});

test("a host that merely ends in the admin host is not the admin host", () => {
  assert.equal(surfaceForHost("evil-admin.shetrades.digital", ADMIN_HOSTS), "public");
  assert.equal(surfaceForHost("notvercel.app", []), "public");
});

test("the privacy policy is served on the public host", () => {
  assert.deepEqual(verdictForPublicRequest("/privacy"), { action: "allow" });
  assert.deepEqual(verdictForPublicRequest("/privacy/"), { action: "allow" });
});

test("certificate pages and their images are served on the public host", () => {
  assert.deepEqual(verdictForPublicRequest("/c/K7QF3MZP2XVA9TLD6BNR4WCH8JYE5SGU"), {
    action: "allow"
  });
  assert.deepEqual(verdictForPublicRequest("/c/K7QF3MZP2XVA9TLD6BNR4WCH8JYE5SGU.png"), {
    action: "allow"
  });
});

test("a bare /c is not a certificate", () => {
  assert.deepEqual(verdictForPublicRequest("/c"), { action: "notFound" });
});

test("the console is not reachable on the public host", () => {
  for (const path of [
    "/login",
    "/dashboard",
    "/users",
    "/settings",
    "/certificates",
    "/previews/components",
    "/handbook",
    "/api/handbook"
  ]) {
    assert.deepEqual(
      verdictForPublicRequest(path),
      { action: "notFound" },
      `${path} must not be served on the public host`
    );
  }
});

test("a blocked path is never redirected", () => {
  // A redirect would name the admin hostname in its Location header, which is
  // the exact disclosure this split exists to prevent.
  for (const path of ["/login", "/dashboard", "/previews/components"]) {
    assert.notEqual(verdictForPublicRequest(path).action, "redirect");
  }
});

test("the public root lands on the policy rather than a dead end", () => {
  assert.deepEqual(verdictForPublicRequest("/"), { action: "redirect", to: "/privacy" });
});

test("the public root redirect cannot loop", () => {
  const root = verdictForPublicRequest("/");
  assert.equal(root.action, "redirect");
  if (root.action === "redirect") {
    assert.deepEqual(verdictForPublicRequest(root.to), { action: "allow" });
  }
});

test("the component workshop is a development-only path", () => {
  assert.equal(isDevelopmentOnlyPath("/previews"), true);
  assert.equal(isDevelopmentOnlyPath("/previews/components"), true);
  assert.equal(isDevelopmentOnlyPath("/previews/components/"), true);
});

test("a path that merely starts with the same letters is not development-only", () => {
  assert.equal(isDevelopmentOnlyPath("/previewsomething"), false);
  assert.equal(isDevelopmentOnlyPath("/privacy"), false);
  assert.equal(isDevelopmentOnlyPath("/certificates/template"), false);
});

test("development-only routes are off in a production build", () => {
  // Vercel builds every deployment with NODE_ENV=production, so this is the
  // case that matters: the workshop is absent from anything deployed.
  assert.equal(developmentOnlyRoutesEnabled({ nodeEnv: "production" }), false);
});

test("development-only routes are on when developing", () => {
  assert.equal(developmentOnlyRoutesEnabled({ nodeEnv: "development" }), true);
  assert.equal(developmentOnlyRoutesEnabled({ nodeEnv: "test" }), true);
  assert.equal(developmentOnlyRoutesEnabled({}), true);
});

test("the explicit flag wins in both directions", () => {
  assert.equal(developmentOnlyRoutesEnabled({ nodeEnv: "production", flag: "true" }), true);
  assert.equal(developmentOnlyRoutesEnabled({ nodeEnv: "production", flag: "1" }), true);
  assert.equal(developmentOnlyRoutesEnabled({ nodeEnv: "development", flag: "false" }), false);
  assert.equal(developmentOnlyRoutesEnabled({ nodeEnv: "development", flag: "0" }), false);
});

test("an unparseable flag falls back to the build mode, not to on", () => {
  assert.equal(developmentOnlyRoutesEnabled({ nodeEnv: "production", flag: "yes" }), false);
  assert.equal(developmentOnlyRoutesEnabled({ nodeEnv: "production", flag: "  " }), false);
});
