/**
 * The challenge token that bridges the two login steps.
 *
 * It proves ONLY that the password check passed. It is short-lived, carries a
 * distinct `typ` that `authenticateJwt` rejects outright, and deliberately has
 * no `sid` — so even if one leaks it cannot be used as a session anywhere.
 */
import { randomUUID } from "node:crypto";
import { getJwtConfig, parseJwtHs256, signJwtHs256, type JwtClaims } from "./token.js";
import { TWO_FACTOR_CHALLENGE_TYP } from "./jwt-rbac.js";

/** Deliberately short: long enough to read a code, short enough to be useless if intercepted. */
export const CHALLENGE_TTL_SECONDS = 5 * 60;

export type ChallengeClaims = JwtClaims & { cid?: string };

export function issueTwoFactorChallenge(userId: string, role: JwtClaims["role"]) {
  const issuedAt = Math.floor(Date.now() / 1000);
  const expiresAt = issuedAt + CHALLENGE_TTL_SECONDS;
  const config = getJwtConfig();
  const claims: ChallengeClaims = {
    sub: userId,
    role,
    typ: TWO_FACTOR_CHALLENGE_TYP,
    // A per-challenge id, so a specific challenge can be traced in logs.
    cid: randomUUID(),
    iat: issuedAt,
    exp: expiresAt,
    ...(config.issuer ? { iss: config.issuer } : {}),
    ...(config.audience ? { aud: config.audience } : {})
  };
  return {
    token: signJwtHs256(claims, config.secret),
    expiresAt: new Date(expiresAt * 1000).toISOString()
  };
}

/**
 * Parse and validate a challenge token. Throws unless it is a well-formed,
 * unexpired token of exactly the challenge type — a session token must never
 * be accepted here either, or the second factor could be skipped by replaying
 * an old session.
 */
export function readTwoFactorChallenge(token: string): { userId: string; role: JwtClaims["role"] } {
  const config = getJwtConfig();
  const claims = parseJwtHs256(token, config.secret) as ChallengeClaims;
  if (claims.typ !== TWO_FACTOR_CHALLENGE_TYP) {
    throw new Error("This is not a two-factor challenge token.");
  }
  const now = Math.floor(Date.now() / 1000);
  if (typeof claims.exp !== "number" || claims.exp <= now) {
    throw new Error("This sign-in attempt has expired. Please start again.");
  }
  if (!claims.sub) {
    throw new Error("Challenge token is missing its subject.");
  }
  return { userId: claims.sub, role: claims.role };
}
