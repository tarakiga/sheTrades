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
