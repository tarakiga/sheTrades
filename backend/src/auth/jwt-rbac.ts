import type { NextFunction, Request, Response } from "express";
import type { AdminSafeUser, AdminSession } from "./contracts.js";
import { getAdminAuthService } from "./service.js";
import {
  getBearerToken,
  getJwtConfig,
  parseJwtHs256,
  signJwtHs256,
  type AuthRole,
  type JwtClaims,
  validateStandardClaims
} from "./token.js";

/**
 * Marks a token that has cleared the password step but NOT the second factor.
 * authenticateJwt rejects it outright; only the 2FA verify endpoint accepts it.
 */
export const TWO_FACTOR_CHALLENGE_TYP = "admin_2fa_challenge";

declare module "express-serve-static-core" {
  interface Request {
    auth?: JwtClaims;
    authUser?: AdminSafeUser;
    authSession?: AdminSession;
  }
}

export async function authenticateJwt(req: Request, res: Response, next: NextFunction) {
  try {
    const token = getBearerToken(req.header("authorization"));
    if (!token) {
      res.status(401).json({ message: "Missing or invalid Authorization bearer token." });
      return;
    }
    const config = getJwtConfig();
    const claims = parseJwtHs256(token, config.secret);
    validateStandardClaims(claims, config.issuer, config.audience);

    // A 2FA challenge token proves ONLY that the password step passed - the
    // second factor has not been presented yet. It must never authenticate a
    // normal route, or it becomes a complete bypass of the feature. Only
    // /auth/2fa/verify accepts it, and it does so explicitly.
    if (claims.typ === TWO_FACTOR_CHALLENGE_TYP) {
      res.status(401).json({
        message: "Unauthorized: two-factor verification is not complete."
      });
      return;
    }
    req.auth = claims;
    if (claims.sid) {
      const sessionContext = await getAdminAuthService().getSessionContextFromClaims(claims);
      if (!sessionContext) {
        throw new Error("Session could not be found.");
      }
      req.authUser = sessionContext.user;
      req.authSession = sessionContext.session;
    }
    next();
  } catch (error) {
    const message = error instanceof Error ? error.message : "JWT authentication failed.";
    if (message.includes("configured")) {
      res.status(500).json({ message });
      return;
    }
    res.status(401).json({ message: `Unauthorized: ${message}` });
  }
}

export function requireRoles(roles: AuthRole[]) {
  const allowed = new Set<AuthRole>(roles);
  return (req: Request, res: Response, next: NextFunction) => {
    const role = req.auth?.role;
    if (!role || !allowed.has(role)) {
      res.status(403).json({ message: "Forbidden: insufficient role for this operation." });
      return;
    }
    next();
  };
}

export function requireAuthenticatedSession(req: Request, res: Response, next: NextFunction) {
  if (!req.auth?.sid || !req.authUser || !req.authSession) {
    res.status(401).json({ message: "Unauthorized: active admin session required." });
    return;
  }
  next();
}

export function signJwtHs256ForTests(
  claims: JwtClaims,
  secret: string,
  header: { alg: "HS256"; typ?: string } = { alg: "HS256", typ: "JWT" }
) {
  return signJwtHs256(claims, secret, header);
}
