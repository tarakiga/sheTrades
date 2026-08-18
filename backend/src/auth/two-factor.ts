/**
 * Two-factor (TOTP) enrolment, verification and recovery for admin accounts.
 *
 * Shape of the flow:
 *   setup()   -> generates a secret and an otpauth URI. NOT yet active.
 *   enable()  -> requires a working code, proving the app was actually scanned,
 *                then activates and returns one-time recovery codes.
 *   disable() -> requires a current code, not just the password.
 *   verify()  -> called during login with the challenge token.
 *
 * Enrolment is deliberately two-phase: activating on setup would let a
 * mistyped or never-scanned secret lock an admin out of their own dashboard.
 */
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "../admin/prisma.js";
import {
  buildOtpAuthUri,
  decryptSecret,
  encryptSecret,
  generateTotpSecret,
  totpEncryptionConfigured,
  verifyTotp
} from "./totp.js";

export const RECOVERY_CODE_COUNT = 10;

export class TwoFactorError extends Error {
  readonly status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.name = "TwoFactorError";
    this.status = status;
  }
}

function normalizeRecoveryCode(code: string): string {
  return code.replace(/[\s-]/g, "").toUpperCase();
}

/**
 * Recovery codes are hashed, never stored in the clear - they are password
 * equivalents. Plain SHA-256 is appropriate here (unlike for passwords)
 * because each code is machine-generated randomness with no dictionary to
 * attack, so a slow KDF would buy nothing.
 */
function hashRecoveryCode(code: string): string {
  return createHash("sha256").update(normalizeRecoveryCode(code)).digest("hex");
}

/** Alphabet without vowels, so codes cannot spell words or be misread. */
function generateRecoveryCode(): string {
  const alphabet = "0123456789BCDFGHJKLMNPQRSTVWXZ";
  const bytes = randomBytes(10);
  let out = "";
  for (let i = 0; i < 10; i++) {
    out += alphabet[bytes[i]! % alphabet.length];
    if (i === 4) out += "-";
  }
  return out;
}

type StoredRecoveryCode = { hash: string; usedAt: string | null };

function readRecoveryCodes(raw: unknown): StoredRecoveryCode[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((entry) => {
    if (!entry || typeof entry !== "object") return [];
    const record = entry as Record<string, unknown>;
    if (typeof record.hash !== "string") return [];
    return [{ hash: record.hash, usedAt: typeof record.usedAt === "string" ? record.usedAt : null }];
  });
}

export type TwoFactorStatus = {
  enabled: boolean;
  enabledAt: string | null;
  recoveryCodesRemaining: number;
};

export async function getTwoFactorStatus(userId: string): Promise<TwoFactorStatus> {
  const account = await prisma.adminAccount.findUnique({
    where: { id: userId },
    select: { totpEnabledAt: true, totpRecoveryCodes: true }
  });
  if (!account) throw new TwoFactorError("Admin account could not be found.", 404);
  const codes = readRecoveryCodes(account.totpRecoveryCodes);
  return {
    enabled: Boolean(account.totpEnabledAt),
    enabledAt: account.totpEnabledAt ? account.totpEnabledAt.toISOString() : null,
    recoveryCodesRemaining: codes.filter((code) => !code.usedAt).length
  };
}

/**
 * Phase 1: mint a secret and hand back the otpauth URI to scan. Stored
 * encrypted but INACTIVE, so an abandoned setup changes nothing.
 */
export async function setupTwoFactor(
  userId: string,
  issuer: string
): Promise<{ secret: string; otpauthUri: string }> {
  if (!totpEncryptionConfigured()) {
    throw new TwoFactorError(
      "Two-factor cannot be enabled until TOTP_ENCRYPTION_KEY is configured on the server.",
      503
    );
  }
  const account = await prisma.adminAccount.findUnique({
    where: { id: userId },
    select: { email: true, totpEnabledAt: true }
  });
  if (!account) throw new TwoFactorError("Admin account could not be found.", 404);
  if (account.totpEnabledAt) {
    throw new TwoFactorError("Two-factor is already enabled. Disable it first to re-enrol.", 409);
  }

  const secret = generateTotpSecret();
  await prisma.adminAccount.update({
    where: { id: userId },
    data: { totpSecret: encryptSecret(secret), totpEnabledAt: null, totpLastUsedStep: null }
  });
  return {
    secret,
    otpauthUri: buildOtpAuthUri({ secretBase32: secret, accountName: account.email, issuer })
  };
}

/** Phase 2: prove the app works, then activate and issue recovery codes. */
export async function enableTwoFactor(
  userId: string,
  code: string
): Promise<{ recoveryCodes: string[] }> {
  const account = await prisma.adminAccount.findUnique({
    where: { id: userId },
    select: { totpSecret: true, totpEnabledAt: true }
  });
  if (!account) throw new TwoFactorError("Admin account could not be found.", 404);
  if (account.totpEnabledAt) throw new TwoFactorError("Two-factor is already enabled.", 409);
  if (!account.totpSecret) {
    throw new TwoFactorError("Start two-factor setup before confirming a code.", 409);
  }

  const secret = decryptSecret(account.totpSecret);
  const result = verifyTotp(secret, code, Date.now());
  if (!result.valid) {
    throw new TwoFactorError("That code is not valid. Check your authenticator app and try again.");
  }

  const plainCodes = Array.from({ length: RECOVERY_CODE_COUNT }, generateRecoveryCode);
  const stored: StoredRecoveryCode[] = plainCodes.map((value) => ({
    hash: hashRecoveryCode(value),
    usedAt: null
  }));

  await prisma.adminAccount.update({
    where: { id: userId },
    data: {
      totpEnabledAt: new Date(),
      totpRecoveryCodes: stored,
      totpLastUsedStep: result.step
    }
  });
  // Returned exactly once - they are not recoverable afterwards.
  return { recoveryCodes: plainCodes };
}

/**
 * Verify a login code. Accepts either a TOTP code or an unused recovery code,
 * and rejects replay of a TOTP code inside its own window.
 */
export async function verifyTwoFactorCode(
  userId: string,
  code: string
): Promise<{ ok: boolean; usedRecoveryCode: boolean }> {
  const account = await prisma.adminAccount.findUnique({
    where: { id: userId },
    select: {
      totpSecret: true,
      totpEnabledAt: true,
      totpRecoveryCodes: true,
      totpLastUsedStep: true
    }
  });
  if (!account?.totpEnabledAt || !account.totpSecret) {
    throw new TwoFactorError("Two-factor is not enabled for this account.", 409);
  }

  const secret = decryptSecret(account.totpSecret);
  const result = verifyTotp(secret, code, Date.now());
  if (result.valid && result.step !== null) {
    // Replay guard: a code stays mathematically valid for its whole window, so
    // without this anyone who observed it could reuse it within ~90 seconds.
    if (account.totpLastUsedStep !== null && result.step <= account.totpLastUsedStep) {
      throw new TwoFactorError("That code has already been used. Wait for the next one.");
    }
    await prisma.adminAccount.update({
      where: { id: userId },
      data: { totpLastUsedStep: result.step }
    });
    return { ok: true, usedRecoveryCode: false };
  }

  // Fall back to recovery codes.
  const codes = readRecoveryCodes(account.totpRecoveryCodes);
  const submitted = hashRecoveryCode(code);
  const matchIndex = codes.findIndex(
    (entry) =>
      !entry.usedAt &&
      entry.hash.length === submitted.length &&
      timingSafeEqual(Buffer.from(entry.hash), Buffer.from(submitted))
  );
  if (matchIndex === -1) return { ok: false, usedRecoveryCode: false };

  const next = codes.map((entry, index) =>
    index === matchIndex ? { ...entry, usedAt: new Date().toISOString() } : entry
  );
  await prisma.adminAccount.update({
    where: { id: userId },
    data: { totpRecoveryCodes: next }
  });
  return { ok: true, usedRecoveryCode: true };
}

/** Turn 2FA off. Requires a working second factor, not just the password. */
export async function disableTwoFactor(userId: string, code: string): Promise<void> {
  const verified = await verifyTwoFactorCode(userId, code);
  if (!verified.ok) throw new TwoFactorError("That code is not valid.");
  await clearTwoFactor(userId);
}

/**
 * Remove 2FA unconditionally - the admin-assisted path for someone who lost
 * both their device and their recovery codes. Callers MUST enforce the role
 * check and write an audit line.
 */
export async function clearTwoFactor(userId: string): Promise<void> {
  await prisma.adminAccount.update({
    where: { id: userId },
    data: {
      totpSecret: null,
      totpEnabledAt: null,
      // Prisma needs an explicit sentinel to write SQL NULL into a Json column.
      totpRecoveryCodes: Prisma.DbNull,
      totpLastUsedStep: null
    }
  });
}

/** Issue a fresh set of recovery codes, invalidating any that remain. */
export async function regenerateRecoveryCodes(userId: string): Promise<string[]> {
  const status = await getTwoFactorStatus(userId);
  if (!status.enabled) throw new TwoFactorError("Two-factor is not enabled for this account.", 409);
  const plainCodes = Array.from({ length: RECOVERY_CODE_COUNT }, generateRecoveryCode);
  await prisma.adminAccount.update({
    where: { id: userId },
    data: {
      totpRecoveryCodes: plainCodes.map((value) => ({
        hash: hashRecoveryCode(value),
        usedAt: null
      }))
    }
  });
  return plainCodes;
}

/** Test seam for the pure helpers. */
export const __testing = { hashRecoveryCode, generateRecoveryCode, normalizeRecoveryCode };
