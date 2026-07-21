import test from "node:test";
import assert from "node:assert/strict";
import { buildSmtpTransportOptions } from "./smtp-transport.js";

const BASE = {
  host: "smtp.hostinger.com",
  port: 587,
  secure: false,
  username: "notifications@example.com",
  password: "s3cret"
};

test("STARTTLS is required on the non-implicit-TLS path", () => {
  // The bug this guards: without requireTLS, nodemailer proceeds to AUTH over
  // a plaintext channel when the server does not advertise STARTTLS, and many
  // providers reject that with 535 — which reads as a wrong password.
  const options = buildSmtpTransportOptions(BASE);
  assert.equal(options.secure, false);
  assert.equal(options.requireTLS, true);
});

test("implicit TLS does not additionally require STARTTLS", () => {
  // Port 465 is already encrypted from the first byte; STARTTLS is meaningless
  // there and some servers error if it is demanded.
  const options = buildSmtpTransportOptions({ ...BASE, port: 465, secure: true });
  assert.equal(options.secure, true);
  assert.equal(options.requireTLS, false);
});

test("credentials are passed through verbatim", () => {
  // No trimming or normalisation here — a password may legitimately contain
  // characters we must not touch.
  const options = buildSmtpTransportOptions({
    ...BASE,
    username: " spaced@example.com ",
    password: "  pad ded  "
  });
  assert.equal(options.auth.user, " spaced@example.com ");
  assert.equal(options.auth.pass, "  pad ded  ");
});

test("host and port are carried through unchanged", () => {
  const options = buildSmtpTransportOptions({ ...BASE, host: "mail.example.net", port: 2525 });
  assert.equal(options.host, "mail.example.net");
  assert.equal(options.port, 2525);
});

test("a greeting timeout is set so a stalled server fails fast", () => {
  const options = buildSmtpTransportOptions(BASE, 4000);
  assert.equal(options.connectionTimeout, 4000);
  assert.equal(options.greetingTimeout, 4000);
});
