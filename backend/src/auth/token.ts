import crypto from "node:crypto";
import { z } from "zod";

export const roleSchema = z.enum(["admin", "editor", "viewer"]);
export type AuthRole = z.infer<typeof roleSchema>;

const jwtHeaderSchema = z.object({
  alg: z.literal("HS256"),
  typ: z.string().optional()
});

export const jwtClaimsSchema = z.object({
  sub: z.string().min(1),
  role: roleSchema,
  sid: z.string().min(1).optional(),
  typ: z.string().optional(),
  exp: z.number().int().optional(),
  iat: z.number().int().optional(),
  iss: z.string().optional(),
  aud: z.union([z.string(), z.array(z.string())]).optional()
});

export type JwtClaims = z.infer<typeof jwtClaimsSchema>;

export function base64UrlDecode(input: string) {
  const normalized = input.replace(/-/g, "+").replace(/_/g, "/");
  const padLength = (4 - (normalized.length % 4)) % 4;
  const padded = normalized + "=".repeat(padLength);
  return Buffer.from(padded, "base64");
}

export function base64UrlEncode(input: Buffer) {
  return input.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

export function getJwtConfig() {
  const secret = process.env.ADMIN_CONFIG_JWT_SECRET;
  if (!secret) {
    throw new Error("ADMIN_CONFIG_JWT_SECRET is not configured.");
  }

  return {
    secret,
    issuer: process.env.ADMIN_CONFIG_JWT_ISSUER,
    audience: process.env.ADMIN_CONFIG_JWT_AUDIENCE
  };
}

export function parseJwtHs256(token: string, secret: string): JwtClaims {
  const parts = token.split(".");
  if (parts.length !== 3) {
    throw new Error("Malformed JWT token.");
  }

  const encodedHeader = parts[0];
  const encodedPayload = parts[1];
  const encodedSignature = parts[2];
  if (!encodedHeader || !encodedPayload || !encodedSignature) {
    throw new Error("Malformed JWT token.");
  }

  const signingInput = `${encodedHeader}.${encodedPayload}`;
  const expectedSignature = base64UrlEncode(
    crypto.createHmac("sha256", secret).update(signingInput).digest()
  );

  const expectedBuffer = Buffer.from(expectedSignature);
  const providedBuffer = Buffer.from(encodedSignature);
  if (
    expectedBuffer.length !== providedBuffer.length ||
    !crypto.timingSafeEqual(expectedBuffer, providedBuffer)
  ) {
    throw new Error("JWT signature validation failed.");
  }

  const header = JSON.parse(base64UrlDecode(encodedHeader).toString("utf8")) as unknown;
  jwtHeaderSchema.parse(header);

  const payload = JSON.parse(base64UrlDecode(encodedPayload).toString("utf8")) as unknown;
  return jwtClaimsSchema.parse(payload);
}

export function validateStandardClaims(claims: JwtClaims, issuer?: string, audience?: string) {
  const now = Math.floor(Date.now() / 1000);
  if (claims.exp !== undefined && now >= claims.exp) {
    throw new Error("JWT is expired.");
  }
  if (issuer && claims.iss !== issuer) {
    throw new Error("JWT issuer mismatch.");
  }
  if (audience) {
    const audiences = typeof claims.aud === "string" ? [claims.aud] : (claims.aud ?? []);
    if (!audiences.includes(audience)) {
      throw new Error("JWT audience mismatch.");
    }
  }
}

export function signJwtHs256(
  claims: JwtClaims,
  secret: string,
  header: { alg: "HS256"; typ?: string } = { alg: "HS256", typ: "JWT" }
) {
  const encodedHeader = base64UrlEncode(Buffer.from(JSON.stringify(header), "utf8"));
  const encodedPayload = base64UrlEncode(Buffer.from(JSON.stringify(claims), "utf8"));
  const signingInput = `${encodedHeader}.${encodedPayload}`;
  const signature = base64UrlEncode(
    crypto.createHmac("sha256", secret).update(signingInput).digest()
  );
  return `${signingInput}.${signature}`;
}

export function getBearerToken(authorizationHeader: string | undefined) {
  if (!authorizationHeader) {
    return null;
  }
  const [scheme, token] = authorizationHeader.split(" ");
  if (scheme !== "Bearer" || !token) {
    return null;
  }
  return token.trim();
}
