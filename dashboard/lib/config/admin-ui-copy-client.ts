"use client";

import { useEffect, useMemo, useState } from "react";
import { extractAdminUiCopyMap } from "./admin-ui-copy-parser";
import type { PublicConfigBundle } from "./contracts";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8080";

export function useAdminUiCopyClient() {
  const [copy, setCopy] = useState<Record<string, string>>({});

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const response = await fetch(`${API_BASE_URL}/api/config/public/content`, {
          cache: "no-store"
        });
        if (!response.ok) {
          return;
        }
        const bundle = (await response.json()) as PublicConfigBundle;
        if (!cancelled) {
          setCopy(extractAdminUiCopyMap(bundle.documents));
        }
      } catch {
        // Keep fallback labels when copy service is unavailable.
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  return useMemo(
    () => ({
      t(key: string, fallback: string) {
        const value = copy[key];
        return typeof value === "string" && value.trim().length > 0 ? value : fallback;
      }
    }),
    [copy]
  );
}
