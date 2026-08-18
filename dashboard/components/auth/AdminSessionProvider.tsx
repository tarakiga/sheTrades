"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import {
  ADMIN_AUTH_TOKEN_UPDATED_EVENT,
  clearStoredAdminAuthToken,
  fetchAdminAuthJson,
  getStoredAdminAuthToken,
  saveStoredAdminAuthToken,
  type AdminSessionUser
} from "../../lib/admin-auth";

/**
 * The login endpoint answers one of two shapes: a full session, or - when the
 * account carries a second factor - a short-lived challenge to exchange at
 * /auth/2fa/verify. It is deliberately NOT a session at that point.
 */
type LoginPayload = {
  session?: {
    token: string;
    expiresAt: string;
  };
  user?: AdminSessionUser;
  twoFactorRequired?: boolean;
  challenge?: { token: string; expiresAt: string };
};

export type SignInResult =
  | { status: "authenticated" }
  | { status: "two_factor_required"; challengeToken: string; challengeExpiresAt: string };

type MePayload = {
  user: AdminSessionUser;
  session: {
    expiresAt: string;
  };
};

type AdminSessionContextValue = {
  status: "loading" | "authenticated" | "unauthenticated";
  user: AdminSessionUser | null;
  expiresAt: string | null;
  signIn: (email: string, password: string) => Promise<SignInResult>;
  completeTwoFactor: (challengeToken: string, code: string) => Promise<void>;
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
  applyProfileUpdate: (user: AdminSessionUser) => void;
};

const AdminSessionContext = createContext<AdminSessionContextValue | null>(null);

export type AdminSessionProviderProps = {
  children: React.ReactNode;
};

export function AdminSessionProvider({ children }: AdminSessionProviderProps) {
  const [status, setStatus] = useState<"loading" | "authenticated" | "unauthenticated">("loading");
  const [user, setUser] = useState<AdminSessionUser | null>(null);
  const [expiresAt, setExpiresAt] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const token = getStoredAdminAuthToken();
    if (!token) {
      setStatus("unauthenticated");
      setUser(null);
      setExpiresAt(null);
      return;
    }

    try {
      const payload = await fetchAdminAuthJson<MePayload>("/api/admin/auth/me", undefined, token);
      setUser(payload.user);
      setExpiresAt(payload.session.expiresAt);
      setStatus("authenticated");
    } catch {
      clearStoredAdminAuthToken();
      setStatus("unauthenticated");
      setUser(null);
      setExpiresAt(null);
    }
  }, []);

  useEffect(() => {
    void refresh();

    function syncTokenState() {
      void refresh();
    }

    window.addEventListener(ADMIN_AUTH_TOKEN_UPDATED_EVENT, syncTokenState as EventListener);
    window.addEventListener("storage", syncTokenState);
    window.addEventListener("focus", syncTokenState);

    return () => {
      window.removeEventListener(ADMIN_AUTH_TOKEN_UPDATED_EVENT, syncTokenState as EventListener);
      window.removeEventListener("storage", syncTokenState);
      window.removeEventListener("focus", syncTokenState);
    };
  }, [refresh]);

  const adoptSession = useCallback(
    (token: string, nextUser: AdminSessionUser, sessionExpiresAt: string) => {
      saveStoredAdminAuthToken(token);
      setUser(nextUser);
      setExpiresAt(sessionExpiresAt);
      setStatus("authenticated");
    },
    []
  );

  const signIn = useCallback(
    async (email: string, password: string): Promise<SignInResult> => {
      const payload = await fetchAdminAuthJson<LoginPayload>("/api/admin/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password })
      });
      if (payload.twoFactorRequired && payload.challenge) {
        // Stop here deliberately: no token is stored, so a half-finished login
        // leaves nothing behind that could be mistaken for a session.
        return {
          status: "two_factor_required",
          challengeToken: payload.challenge.token,
          challengeExpiresAt: payload.challenge.expiresAt
        };
      }
      if (!payload.session || !payload.user) {
        throw new Error("Sign-in response was not understood.");
      }
      adoptSession(payload.session.token, payload.user, payload.session.expiresAt);
      return { status: "authenticated" };
    },
    [adoptSession]
  );

  /** Step two: exchange the challenge plus a code for a real session. */
  const completeTwoFactor = useCallback(
    async (challengeToken: string, code: string) => {
      const payload = await fetchAdminAuthJson<LoginPayload>("/api/admin/auth/2fa/verify", {
        method: "POST",
        body: JSON.stringify({ challengeToken, code })
      });
      if (!payload.session || !payload.user) {
        throw new Error("Two-factor response was not understood.");
      }
      adoptSession(payload.session.token, payload.user, payload.session.expiresAt);
    },
    [adoptSession]
  );

  const signOut = useCallback(async () => {
    const token = getStoredAdminAuthToken();
    if (token) {
      try {
        await fetchAdminAuthJson("/api/admin/auth/logout", { method: "POST" }, token);
      } catch {
        // Clear local state even if the backend session is already gone.
      }
    }
    clearStoredAdminAuthToken();
    setUser(null);
    setExpiresAt(null);
    setStatus("unauthenticated");
  }, []);

  const applyProfileUpdate = useCallback((nextUser: AdminSessionUser) => {
    setUser(nextUser);
  }, []);

  const value = useMemo<AdminSessionContextValue>(
    () => ({
      status,
      user,
      expiresAt,
      signIn,
      completeTwoFactor,
      signOut,
      refresh,
      applyProfileUpdate
    }),
    [applyProfileUpdate, completeTwoFactor, expiresAt, refresh, signIn, signOut, status, user]
  );

  return <AdminSessionContext.Provider value={value}>{children}</AdminSessionContext.Provider>;
}

export function useAdminSession() {
  const value = useContext(AdminSessionContext);
  if (!value) {
    throw new Error("useAdminSession must be used inside AdminSessionProvider.");
  }
  return value;
}
