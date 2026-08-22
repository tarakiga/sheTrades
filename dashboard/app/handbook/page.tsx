"use client";

import { useEffect, useState } from "react";
import { getStoredAdminAuthToken } from "../../lib/admin-auth";
import { EmptyState, LoadingState } from "../../components/ui";

/**
 * Fetches the handbook with the session token and renders it in an iframe.
 *
 * An iframe cannot set an Authorization header, so it cannot point at the
 * protected route directly. Fetching the document and handing the iframe a blob
 * URL is what lets the response stay behind a session check while the handbook
 * still renders as the self-contained page it was built as - its own styles, its
 * own scroll, no chance of its CSS reaching the console around it.
 */
export default function HandbookPage() {
  const [source, setSource] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let objectUrl: string | null = null;
    let cancelled = false;

    async function load() {
      try {
        const response = await fetch("/api/handbook", {
          headers: { authorization: `Bearer ${getStoredAdminAuthToken()}` },
          cache: "no-store"
        });
        if (!response.ok) {
          throw new Error(
            response.status === 401
              ? "Your session has expired. Sign in again to read the handbook."
              : "The handbook could not be loaded. Try again in a moment."
          );
        }
        const blob = await response.blob();
        if (cancelled) {
          return;
        }
        objectUrl = URL.createObjectURL(blob);
        setSource(objectUrl);
      } catch (cause) {
        if (!cancelled) {
          setError(cause instanceof Error ? cause.message : "The handbook could not be loaded.");
        }
      }
    }

    void load();

    return () => {
      cancelled = true;
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
    };
  }, []);

  if (error) {
    return (
      <main className="handbook-page handbook-page--message">
        <EmptyState title="Handbook unavailable" description={error} />
      </main>
    );
  }

  if (!source) {
    return (
      <main className="handbook-page handbook-page--message">
        <LoadingState label="Opening the operator handbook..." />
      </main>
    );
  }

  return (
    <main className="handbook-page">
      <iframe className="handbook-page__frame" src={source} title="SheTrades operator handbook" />
    </main>
  );
}
