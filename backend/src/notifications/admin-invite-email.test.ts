import test from "node:test";
import assert from "node:assert/strict";
import {
  buildAdminInviteEmail,
  resolveAdminLoginUrl,
  sendAdminInviteEmail,
  type AdminInviteContext
} from "./admin-invite-email.js";

const CONTEXT: AdminInviteContext = {
  fullName: "Amara Okeke",
  email: "amara@example.com",
  role: "editor",
  invitedByName: "Tari Admin"
};

test("the invite names the member and how to sign in", () => {
  const { subject, text } = buildAdminInviteEmail(CONTEXT, "https://dash.example.com/login");
  assert.match(subject, /added to the SheTrades admin/i);
  assert.match(text, /Amara Okeke/);
  assert.match(text, /amara@example\.com/);
  assert.match(text, /Editor/);
  assert.match(text, /Tari Admin/);
  assert.match(text, /https:\/\/dash\.example\.com\/login/);
});

test("the invite NEVER contains a password", () => {
  // Emailing a working credential is the one thing this feature must not do.
  const { text } = buildAdminInviteEmail(CONTEXT, "https://dash.example.com/login");
  assert.doesNotMatch(text, /password:/i);
  assert.match(text, /password is not included/i);
});

test("a missing login URL degrades to a spoken instruction, not a broken link", () => {
  const { text } = buildAdminInviteEmail(CONTEXT, null);
  assert.doesNotMatch(text, /Log in here:/);
  assert.match(text, /dashboard link your administrator shares/i);
});

test("resolveAdminLoginUrl uses ADMIN_DASHBOARD_URL and appends /login", () => {
  const prev = process.env.ADMIN_DASHBOARD_URL;
  const prevCors = process.env.BACKEND_CORS_ALLOWED_ORIGINS;
  process.env.ADMIN_DASHBOARD_URL = "https://admin.shetrades.digital/";
  delete process.env.BACKEND_CORS_ALLOWED_ORIGINS;
  try {
    assert.equal(resolveAdminLoginUrl(), "https://admin.shetrades.digital/login");
  } finally {
    if (prev === undefined) delete process.env.ADMIN_DASHBOARD_URL;
    else process.env.ADMIN_DASHBOARD_URL = prev;
    if (prevCors !== undefined) process.env.BACKEND_CORS_ALLOWED_ORIGINS = prevCors;
  }
});

test("resolveAdminLoginUrl falls back to the first configured CORS origin", () => {
  const prev = process.env.ADMIN_DASHBOARD_URL;
  const prevCors = process.env.BACKEND_CORS_ALLOWED_ORIGINS;
  delete process.env.ADMIN_DASHBOARD_URL;
  process.env.BACKEND_CORS_ALLOWED_ORIGINS = "https://one.example.com, https://two.example.com";
  try {
    assert.equal(resolveAdminLoginUrl(), "https://one.example.com/login");
  } finally {
    if (prev !== undefined) process.env.ADMIN_DASHBOARD_URL = prev;
    if (prevCors === undefined) delete process.env.BACKEND_CORS_ALLOWED_ORIGINS;
    else process.env.BACKEND_CORS_ALLOWED_ORIGINS = prevCors;
  }
});

test("sending is skipped, not failed, when no SMTP integration exists", async () => {
  const result = await sendAdminInviteEmail(CONTEXT, { loadConfig: () => null });
  assert.equal(result.status, "skipped");
});

test("sending is skipped when the SMTP integration is disabled", async () => {
  const result = await sendAdminInviteEmail(CONTEXT, {
    loadConfig: () =>
      ({ enabled: false, host: "h", port: 587, secure: false, username: "u", password: "p", fromName: "n", fromEmail: "f@x.com" }) as never
  });
  assert.equal(result.status, "skipped");
});

test("a transport failure is reported, not thrown", async () => {
  // Account creation already succeeded — a mail outage must not surface as 500.
  const result = await sendAdminInviteEmail(CONTEXT, {
    loadConfig: () =>
      ({ enabled: true, host: "h", port: 587, secure: false, username: "u", password: "p", fromName: "n", fromEmail: "f@x.com" }) as never,
    createTransport: (() => ({
      sendMail: async () => {
        throw new Error("connection refused");
      }
    })) as never
  });
  assert.equal(result.status, "failed");
  assert.match((result as { reason: string }).reason, /connection refused/);
});

test("a successful send is addressed to the new member and carries no password", async () => {
  const captured: Array<Record<string, unknown>> = [];
  const result = await sendAdminInviteEmail(CONTEXT, {
    loadConfig: () =>
      ({ enabled: true, host: "h", port: 465, secure: true, username: "u", password: "p", fromName: "SheTrades", fromEmail: "bot@shetrades.digital", replyToEmail: "" }) as never,
    createTransport: (() => ({
      sendMail: async (message: Record<string, unknown>) => {
        captured.push(message);
        return { messageId: "abc123" };
      }
    })) as never
  });

  assert.equal(result.status, "sent");
  const sent = captured[0];
  assert.ok(sent);
  assert.equal(sent.to, "amara@example.com");
  assert.match(String(sent.from), /SheTrades/);
  assert.match(String(sent.subject), /admin/i);
  assert.doesNotMatch(String(sent.text), /password:/i);
});
