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

type LoginPayload = {
  session: {
    token: string;
    expiresAt: string;
  };
  user: AdminSessionUser;
};

type MePayload = {
  user: AdminSessionUser;
  session: {
    expiresAt: string;
  };
};

type ProfilePayload = {
  user: AdminSessionUser;
};

type AdminSessionContextValue = {
  status: "loading" | "authenticated" | "unauthenticated";
  user: AdminSessionUser | null;
  expiresAt: string | null;
  signIn: (email: string, password: string) => Promise<void>;
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

  const signIn = useCallback(async (email: string, password: string) => {
    const payload = await fetchAdminAuthJson<LoginPayload>("/api/admin/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password })
    });
    saveStoredAdminAuthToken(payload.session.token);
    setUser(payload.user);
    setExpiresAt(payload.session.expiresAt);
    setStatus("authenticated");
  }, []);

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
      signOut,
      refresh,
      applyProfileUpdate
    }),
    [applyProfileUpdate, expiresAt, refresh, signIn, signOut, status, user]
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
