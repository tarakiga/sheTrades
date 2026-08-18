import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import request from "supertest";
import {
  CHALLENGE_TTL_SECONDS,
  issueTwoFactorChallenge,
  readTwoFactorChallenge
} from "./two-factor-login.js";
import { authenticateJwt, TWO_FACTOR_CHALLENGE_TYP } from "./jwt-rbac.js";
import { signJwtHs256 } from "./token.js";

/**
 * The security of this whole feature rests on one property: a challenge token
 * proves the PASSWORD step only, and must never authenticate anything else.
 * If authenticateJwt ever accepts one, 2FA becomes decorative - an attacker
 * with a stolen password gets a working token from step one and simply never
 * calls step two. These tests exist to make that regression loud.
 */

const SECRET = "test-jwt-secret-for-two-factor";

function withJwtEnv<T>(fn: () => T): T {
  const previous = process.env.ADMIN_CONFIG_JWT_SECRET;
  process.env.ADMIN_CONFIG_JWT_SECRET = SECRET;
  try {
    return fn();
  } finally {
    if (previous === undefined) delete process.env.ADMIN_CONFIG_JWT_SECRET;
    else process.env.ADMIN_CONFIG_JWT_SECRET = previous;
  }
}

/**
 * Async variant. The sync one restores the env in a finally that runs BEFORE an
 * awaited body resolves, which silently unsets the secret mid-request and turns
 * a real 401 into a misleading 500.
 */
async function withJwtEnvAsync<T>(fn: () => Promise<T>): Promise<T> {
  const previous = process.env.ADMIN_CONFIG_JWT_SECRET;
  process.env.ADMIN_CONFIG_JWT_SECRET = SECRET;
  try {
    return await fn();
  } finally {
    if (previous === undefined) delete process.env.ADMIN_CONFIG_JWT_SECRET;
    else process.env.ADMIN_CONFIG_JWT_SECRET = previous;
  }
}

/** A minimal app whose only protection is authenticateJwt. */
function guardedApp() {
  const app = express();
  app.use(express.json());
  app.get("/protected", authenticateJwt, (_req, res) => {
    res.status(200).json({ reached: true });
  });
  return app;
}

test("a challenge token is REJECTED by authenticateJwt (the bypass this feature depends on)", async () => {
  const token = withJwtEnv(() => issueTwoFactorChallenge("user-1", "admin").token);
  await withJwtEnvAsync(async () => {
    const response = await request(guardedApp())
      .get("/protected")
      .set("authorization", `Bearer ${token}`);
    assert.equal(response.status, 401, "a challenge token must never authenticate a normal route");
    assert.match(String(response.body.message), /two-factor/i);
  });
});

test("a challenge token carries no session id, so it cannot resolve to a session", () => {
  withJwtEnv(() => {
    const token = issueTwoFactorChallenge("user-1", "admin").token;
    const [, payload] = token.split(".");
    const claims = JSON.parse(Buffer.from(payload!, "base64url").toString("utf8"));
    assert.equal(claims.sid, undefined, "no sid - nothing for a session lookup to latch onto");
    assert.equal(claims.typ, TWO_FACTOR_CHALLENGE_TYP);
    assert.equal(claims.sub, "user-1");
  });
});

test("readTwoFactorChallenge round-trips a freshly issued challenge", () => {
  withJwtEnv(() => {
    const { token } = issueTwoFactorChallenge("user-42", "editor");
    const parsed = readTwoFactorChallenge(token);
    assert.equal(parsed.userId, "user-42");
    assert.equal(parsed.role, "editor");
  });
});

test("readTwoFactorChallenge refuses a normal SESSION token", () => {
  withJwtEnv(() => {
    const now = Math.floor(Date.now() / 1000);
    const sessionToken = signJwtHs256(
      { sub: "user-1", role: "admin", sid: "session-1", typ: "admin_session", iat: now, exp: now + 600 },
      SECRET
    );
    // Otherwise an old session could be replayed to skip the second factor.
    assert.throws(() => readTwoFactorChallenge(sessionToken), /not a two-factor challenge/i);
  });
});

test("readTwoFactorChallenge refuses an expired challenge", () => {
  withJwtEnv(() => {
    const now = Math.floor(Date.now() / 1000);
    const stale = signJwtHs256(
      {
        sub: "user-1",
        role: "admin",
        typ: TWO_FACTOR_CHALLENGE_TYP,
        iat: now - CHALLENGE_TTL_SECONDS - 120,
        exp: now - 60
      },
      SECRET
    );
    assert.throws(() => readTwoFactorChallenge(stale), /expired/i);
  });
});

test("readTwoFactorChallenge refuses a challenge signed with the wrong key", () => {
  const forged = signJwtHs256(
    {
      sub: "user-1",
      role: "admin",
      typ: TWO_FACTOR_CHALLENGE_TYP,
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 300
    },
    "a-different-secret"
  );
  withJwtEnv(() => {
    assert.throws(() => readTwoFactorChallenge(forged));
  });
});

test("the challenge is short-lived", () => {
  withJwtEnv(() => {
    const { expiresAt } = issueTwoFactorChallenge("user-1", "admin");
    const lifetimeMs = new Date(expiresAt).getTime() - Date.now();
    assert.ok(lifetimeMs > 0, "must be in the future");
    assert.ok(
      lifetimeMs <= CHALLENGE_TTL_SECONDS * 1000 + 2000,
      "must not outlive the configured TTL"
    );
    assert.ok(lifetimeMs <= 10 * 60 * 1000, "a challenge must never be long-lived");
  });
});
