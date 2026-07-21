import test from "node:test";
import assert from "node:assert/strict";
import { diagnoseSmtpFailure } from "./smtp-diagnosis.js";

/**
 * The Test Connection panel used to surface the raw SMTP string, e.g.
 * "Invalid login: 535 5.7.8 Error: authentication failed:". That is precise and
 * useless — it tells an admin nothing about which of host, port, encryption,
 * username or password to change. These map the failures people actually hit
 * onto the next action to take.
 */

test("535 blames the credentials, not the connection", () => {
  const d = diagnoseSmtpFailure("Invalid login: 535 5.7.8 Error: authentication failed:");
  assert.match(d.summary, /username or password/i);
  // Reaching AUTH proves host/port/encryption already worked — saying so stops
  // an admin rewriting settings that are fine.
  assert.match(d.guidance, /full email address/i);
  assert.match(d.guidance, /mailbox password/i);
});

test("535 guidance mentions that the connection itself succeeded", () => {
  const d = diagnoseSmtpFailure("535 5.7.8 authentication failed");
  assert.match(d.guidance, /host, port and encryption/i);
});

test("a refused connection points at host, port and firewall", () => {
  const d = diagnoseSmtpFailure("connect ECONNREFUSED 127.0.0.1:587");
  assert.match(d.summary, /could not connect/i);
  assert.match(d.guidance, /port/i);
});

test("a timeout is distinguished from a refusal", () => {
  const d = diagnoseSmtpFailure("Connection timeout");
  assert.match(d.summary, /timed out/i);
  assert.match(d.guidance, /firewall|blocked/i);
});

test("an unknown host points at the hostname", () => {
  const d = diagnoseSmtpFailure("getaddrinfo ENOTFOUND smtp.example.invalid");
  assert.match(d.summary, /hostname/i);
});

test("a TLS version mismatch points at the port/encryption pairing", () => {
  // The classic 465-vs-587 mistake: implicit TLS attempted on a STARTTLS port.
  const d = diagnoseSmtpFailure("routines:ssl3_get_record:wrong version number");
  assert.match(d.summary, /encryption/i);
  assert.match(d.guidance, /465/);
  assert.match(d.guidance, /587/);
});

test("a self-signed certificate is called out specifically", () => {
  const d = diagnoseSmtpFailure("self signed certificate in certificate chain");
  assert.match(d.summary, /certificate/i);
});

test("Gmail's app-password requirement is named", () => {
  const d = diagnoseSmtpFailure("534-5.7.9 Application-specific password required");
  assert.match(d.guidance, /app(-| )specific password/i);
});

test("an unrecognised failure degrades to generic guidance, never empty", () => {
  const d = diagnoseSmtpFailure("something entirely unexpected");
  assert.ok(d.summary.length > 0);
  assert.ok(d.guidance.length > 0);
});

test("the raw server response is always preserved for debugging", () => {
  const raw = "535 5.7.8 Error: authentication failed:";
  const d = diagnoseSmtpFailure(raw);
  assert.match(d.details, /535 5\.7\.8/);
});

test("an empty error does not produce a broken message", () => {
  const d = diagnoseSmtpFailure("");
  assert.ok(d.summary.length > 0);
  assert.ok(d.guidance.length > 0);
});
