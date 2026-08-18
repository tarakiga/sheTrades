/**
 * Client for the admin two-factor endpoints.
 *
 * Note the split: `verifyTwoFactorLogin` is UNAUTHENTICATED (the caller has no
 * session yet — the challenge token is the credential), while everything else
 * requires an active session.
 */
import { fetchAdminAuthJson } from "../admin-auth";

export type TwoFactorStatus = {
  enabled: boolean;
  enabledAt: string | null;
  recoveryCodesRemaining: number;
};

export type TwoFactorSetup = {
  secret: string;
  otpauthUri: string;
};

export type TwoFactorLoginResult = {
  session: { token: string; expiresAt: string };
  user: { id: string; email: string; fullName: string; role: string; avatarUrl?: string };
  usedRecoveryCode?: boolean;
};

export function getTwoFactorStatus(): Promise<TwoFactorStatus> {
  return fetchAdminAuthJson<TwoFactorStatus>("/api/admin/auth/2fa/status");
}

/** Phase 1 of enrolment: mint a secret to scan. Does NOT switch 2FA on. */
export function startTwoFactorSetup(): Promise<TwoFactorSetup> {
  return fetchAdminAuthJson<TwoFactorSetup>("/api/admin/auth/2fa/setup", {
    method: "POST",
    body: "{}"
  });
}

/** Phase 2: confirm with a working code. Recovery codes are returned ONCE. */
export function confirmTwoFactorSetup(code: string): Promise<{ recoveryCodes: string[] }> {
  return fetchAdminAuthJson<{ recoveryCodes: string[] }>("/api/admin/auth/2fa/enable", {
    method: "POST",
    body: JSON.stringify({ code })
  });
}

export function disableTwoFactor(code: string): Promise<{ message: string }> {
  return fetchAdminAuthJson<{ message: string }>("/api/admin/auth/2fa/disable", {
    method: "POST",
    body: JSON.stringify({ code })
  });
}

export function regenerateRecoveryCodes(): Promise<{ recoveryCodes: string[] }> {
  return fetchAdminAuthJson<{ recoveryCodes: string[] }>("/api/admin/auth/2fa/recovery-codes", {
    method: "POST",
    body: "{}"
  });
}

/** Admin-assisted reset for someone who lost their device AND their codes. */
export function resetTeamMemberTwoFactor(adminId: string): Promise<{ message: string }> {
  return fetchAdminAuthJson<{ message: string }>(
    `/api/admin/team/${encodeURIComponent(adminId)}/reset-2fa`,
    { method: "POST", body: "{}" }
  );
}
