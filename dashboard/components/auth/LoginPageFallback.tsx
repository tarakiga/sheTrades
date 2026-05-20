"use client";

import { AuthPageShell } from "./AuthPageShell";
import { LoadingState } from "../ui";

export function LoginPageFallback() {
  return (
    <main className="auth-page" suppressHydrationWarning>
      <AuthPageShell
        desktopMode="viewport-fit"
        eyebrow="SheTrades Admin"
        title="Preparing your workspace"
        description="Loading the secure sign-in experience and validating your current session."
        asideLabel="Secure admin access"
        asideTitle="Protected entry experience"
        asideDescription="The sign-in shell keeps the same executive layout while your session context is being prepared."
        asideHighlights={[
          { value: "Protected", label: "Admin routes" },
          { value: "Session-backed", label: "Access flow" }
        ]}
        asidePoints={[
          "Role-aware access checks are running",
          "Protected workspaces are prepared after sign-in",
          "Profile and session controls remain available once loaded"
        ]}
        footer={
          <p className="auth-shell__footnote" suppressHydrationWarning>
            Preparing sign-in workspace...
          </p>
        }
      >
        <div className="ui-card auth-login-card auth-login-card--compact" suppressHydrationWarning>
          <div className="auth-login-card__content" suppressHydrationWarning>
            <LoadingState label="Preparing sign-in workspace..." />
          </div>
        </div>
      </AuthPageShell>
    </main>
  );
}
