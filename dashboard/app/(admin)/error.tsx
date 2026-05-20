"use client";

import { useEffect, useState, startTransition } from "react";
import { Button } from "../../components/ui";
import { useAdminUiCopyClient } from "../../lib/config/admin-ui-copy-client";

type AdminErrorProps = {
  error: Error & { digest?: string };
  reset: () => void;
};

export default function AdminError({ error, reset }: AdminErrorProps) {
  const { t } = useAdminUiCopyClient();
  const [isRetrying, setIsRetrying] = useState(false);
  const [showDiagnostics, setShowDiagnostics] = useState(false);

  useEffect(() => {
    console.error(error);
  }, [error]);

  const handleRetry = () => {
    setIsRetrying(true);
    startTransition(() => {
      reset();
      // Keep state showing loading for a brief moment so spinner is visible
      setTimeout(() => {
        setIsRetrying(false);
      }, 600);
    });
  };

  return (
    <main className="admin-dashboard-page" style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "75vh", padding: "2rem" }}>
      <div className="ui-card" style={{ maxWidth: "580px", width: "100%", padding: "2.5rem", borderRadius: "16px", boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.05), 0 10px 10px -5px rgba(0, 0, 0, 0.02)", border: "1px solid var(--color-neutral-200)", background: "#ffffff", display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center" }}>
        
        {/* Visual Pulse & Icon representing system server outage */}
        <div style={{ position: "relative", marginBottom: "1.5rem" }}>
          <div className="pulse-aura" style={{ position: "absolute", inset: "-12px", borderRadius: "50%", background: "rgba(239, 68, 68, 0.1)", filter: "blur(8px)" }} />
          <div style={{ position: "relative", width: "64px", height: "64px", borderRadius: "50%", background: "var(--color-danger-50)", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--color-danger-600)" }}>
            <svg viewBox="0 0 24 24" width="36" height="36" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
              <rect x="2" y="2" width="20" height="8" rx="2" ry="2" />
              <rect x="2" y="14" width="20" height="8" rx="2" ry="2" />
              <line x1="6" y1="6" x2="6.01" y2="6" strokeWidth="2.5" />
              <line x1="6" y1="18" x2="6.01" y2="18" strokeWidth="2.5" />
              <path d="M17 6h3" />
              <path d="M17 18h3" />
              <circle cx="20" cy="12" r="3" fill="var(--color-danger-500)" stroke="#ffffff" strokeWidth="1" />
            </svg>
          </div>
        </div>

        <span style={{ fontSize: "0.75rem", fontWeight: "700", textTransform: "uppercase", letterSpacing: "0.05em", padding: "0.25rem 0.75rem", borderRadius: "9999px", background: "var(--color-danger-50)", color: "var(--color-danger-700)", marginBottom: "0.75rem" }}>
          Connection Error
        </span>

        <h2 style={{ fontSize: "1.5rem", fontWeight: "700", color: "var(--color-neutral-900)", marginBottom: "0.75rem" }}>
          {t("error.serverUnavailable.title", "Server Connection Failure")}
        </h2>
        
        <p style={{ fontSize: "0.95rem", color: "var(--color-neutral-600)", lineHeight: "1.6", marginBottom: "1.75rem" }}>
          {t(
            "error.serverUnavailable.description",
            "The administrator console is unable to secure a connection to the backend application server. This indicates a temporary network or database sync issue. It is NOT a missing or unpopulated data state."
          )}
        </p>

        {/* Recoverability CTAs */}
        <div style={{ display: "flex", gap: "1rem", justifyContent: "center", width: "100%", marginBottom: "1.75rem" }}>
          <Button variant="primary" onClick={handleRetry} loading={isRetrying} size="lg">
            {t("error.serverUnavailable.retryBtn", "Retry Connection")}
          </Button>
          <Button variant="secondary" onClick={() => window.location.assign("/dashboard")} size="lg">
            {t("error.serverUnavailable.dashboardBtn", "Dashboard Overview")}
          </Button>
        </div>

        {/* Detailed diagnostic dropdown (expandable for developers/support) */}
        <div style={{ width: "100%", borderTop: "1px solid var(--color-neutral-100)", paddingTop: "1.25rem", textAlign: "left" }}>
          <button 
            onClick={() => setShowDiagnostics(!showDiagnostics)} 
            style={{ background: "none", border: "none", color: "var(--color-neutral-500)", fontSize: "0.85rem", display: "flex", alignItems: "center", gap: "0.35rem", cursor: "pointer", padding: "0", font: "inherit", fontWeight: "500" }}
          >
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" style={{ transform: showDiagnostics ? "rotate(90deg)" : "rotate(0deg)", transition: "transform 0.2s" }}>
              <polyline points="9 18 15 12 9 6" />
            </svg>
            {showDiagnostics ? t("error.diagnostics.hide", "Hide diagnostic details") : t("error.diagnostics.show", "Show diagnostic details")}
          </button>
          
          {showDiagnostics && (
            <div style={{ marginTop: "0.75rem", background: "var(--color-neutral-50)", padding: "1rem", borderRadius: "8px", border: "1px solid var(--color-neutral-200)", overflowX: "auto" }}>
              <p style={{ margin: "0 0 0.5rem 0", fontSize: "0.8rem", fontWeight: "700", color: "var(--color-neutral-700)" }}>
                Error Diagnostics (HTTP 500):
              </p>
              <code style={{ fontSize: "0.75rem", color: "var(--color-danger-700)", fontFamily: "monospace", wordBreak: "break-all" }}>
                {error.message || "Failed to parse API response"}
              </code>
              {error.digest && (
                <p style={{ margin: "0.5rem 0 0 0", fontSize: "0.7rem", color: "var(--color-neutral-400)", fontFamily: "monospace" }}>
                  Digest ID: {error.digest}
                </p>
              )}
            </div>
          )}
        </div>

      </div>

      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes pulseAura {
          0% { transform: scale(0.92); opacity: 0.4; }
          50% { transform: scale(1.08); opacity: 0.8; }
          100% { transform: scale(0.92); opacity: 0.4; }
        }
        .pulse-aura {
          animation: pulseAura 2s infinite ease-in-out;
        }
      ` }} />
    </main>
  );
}
