"use client";

import { useState } from "react";
import { Badge, Button, Card } from "../../../components/ui";
import { AdminSessionProvider } from "../../../components/auth/AdminSessionProvider";
import { AuthPageShell } from "../../../components/auth/AuthPageShell";
import { LoginFormCard, type LoginFormValue } from "../../../components/auth/LoginFormCard";
import { RootEntryRedirect } from "../../../components/auth/RootEntryRedirect";
import {
  ProfileDetailsForm,
  type ProfileDetailsFormValue
} from "../../../components/auth/ProfileDetailsForm";
import {
  ProfilePasswordForm,
  type ProfilePasswordFormValue
} from "../../../components/auth/ProfilePasswordForm";
import { ProfileSidebarCard } from "../../../components/auth/ProfileSidebarCard";
import { ProfileSummaryCard } from "../../../components/auth/ProfileSummaryCard";
import type { AuthStatusMessage } from "../../../components/auth/types";

const previewUser = {
  fullName: "Aisha Yusuf",
  email: "aisha@shetrades.org",
  role: "admin",
  avatarUrl: "",
  lastLoginAt: "2026-05-18 00:30 UTC"
};

export function AdminAuthPreview() {
  const [loginValue, setLoginValue] = useState<LoginFormValue>({
    email: previewUser.email,
    password: "Password123!"
  });
  const [loginState, setLoginState] = useState<"idle" | "loading" | "error" | "help">("idle");
  const [entryState, setEntryState] = useState<"loading" | "authenticated" | "unauthenticated">(
    "loading"
  );
  const [profileValue, setProfileValue] = useState<ProfileDetailsFormValue>({
    fullName: previewUser.fullName,
    avatarUrl: ""
  });
  const [passwordValue, setPasswordValue] = useState<ProfilePasswordFormValue>({
    currentPassword: "Password123!",
    newPassword: "Password456!"
  });
  const [profileStatus, setProfileStatus] = useState<AuthStatusMessage | null>({
    tone: "success",
    title: "Profile changes saved",
    description: "Updated account details appear in the sidebar card immediately."
  });
  const [passwordStatus, setPasswordStatus] = useState<AuthStatusMessage | null>({
    tone: "warning",
    title: "Password policy reminder",
    description: "Use at least 10 characters and avoid reusing your current password."
  });

  const loginStatus: AuthStatusMessage =
    loginState === "error"
      ? {
          tone: "danger",
          title: "We could not sign you in",
          description: "Invalid email or password. Confirm that your admin account is active."
        }
      : loginState === "help"
        ? {
            tone: "info",
            title: "Need help signing in?",
            description: "Use the admin account assigned to your team and confirm that your secure credentials are current."
          }
        : loginState === "loading"
          ? {
              tone: "info",
              title: "Signing you in",
              description: "Preparing your secure admin workspace."
            }
          : {
              tone: "info",
              title: "Ready to sign in",
              description: "Use a seeded admin account to enter the dashboard."
            };

  return (
    <div className="preview-card-content">
      <Card
        title="Root Entry Redirect"
        description="Preview the thin production entry handoff before the root route decides between dashboard and login."
      >
        <div className="preview-row">
          <Button
            variant={entryState === "loading" ? "primary" : "secondary"}
            size="sm"
            onClick={() => setEntryState("loading")}
          >
            Loading
          </Button>
          <Button
            variant={entryState === "authenticated" ? "primary" : "secondary"}
            size="sm"
            onClick={() => setEntryState("authenticated")}
          >
            Signed In
          </Button>
          <Button
            variant={entryState === "unauthenticated" ? "primary" : "secondary"}
            size="sm"
            onClick={() => setEntryState("unauthenticated")}
          >
            Signed Out
          </Button>
        </div>
        <AdminSessionProvider>
          <RootEntryRedirect statusOverride={entryState} />
        </AdminSessionProvider>
      </Card>

      <Card
        title="Auth Page Shell"
        description="Executive-premium shell for the dedicated sign-in route, including previewable state quality."
      >
        <div className="preview-row">
          <Button variant={loginState === "idle" ? "primary" : "secondary"} size="sm" onClick={() => setLoginState("idle")}>
            Idle
          </Button>
          <Button variant={loginState === "loading" ? "primary" : "secondary"} size="sm" onClick={() => setLoginState("loading")}>
            Loading
          </Button>
          <Button variant={loginState === "error" ? "primary" : "secondary"} size="sm" onClick={() => setLoginState("error")}>
            Error
          </Button>
          <Button variant={loginState === "help" ? "primary" : "secondary"} size="sm" onClick={() => setLoginState("help")}>
            Help
          </Button>
        </div>
        <AuthPageShell
          eyebrow="SheTrades Admin"
          title="Welcome back"
          description="Sign in with your admin account to manage content, integrations, and operational settings."
          heroBadge={<Badge variant="info">Executive admin access</Badge>}
          heroHighlights={
            <div className="auth-shell__hero-strip">
              <div className="auth-shell__hero-metric">
                <strong className="auth-shell__hero-metric-value">Role-aware</strong>
                <span className="auth-shell__hero-metric-label">Access control</span>
              </div>
              <div className="auth-shell__hero-metric">
                <strong className="auth-shell__hero-metric-value">3 core</strong>
                <span className="auth-shell__hero-metric-label">Managed workspaces</span>
              </div>
              <div className="auth-shell__hero-metric">
                <strong className="auth-shell__hero-metric-value">Session-backed</strong>
                <span className="auth-shell__hero-metric-label">Secure continuity</span>
              </div>
            </div>
          }
          asideLabel="Secure admin access"
          asideTitle="Trusted operational control"
          asideDescription="This experience is designed for calm, secure admin access with role-aware protections."
          asideHighlights={[
            { value: "Protected", label: "Admin routes" },
            { value: "Live", label: "Managed content" },
            { value: "Audited", label: "Workflow changes" }
          ]}
          asidePoints={[
            "Seeded admin accounts for controlled access",
            "Session-backed authentication for protected routes",
            "Profile and password self-service in one place"
          ]}
          supportTitle="Controlled support access"
          supportDescription="Keep recovery guidance close without interrupting the primary action."
          supportAction={
            <Button variant="ghost" size="sm" onClick={() => setLoginState("help")}>
              Need help signing in?
            </Button>
          }
          footer={
            <p className="auth-shell__footnote">
              Use only the admin account assigned to your role. Authenticated sessions redirect directly into your protected workspace.
            </p>
          }
        >
          <LoginFormCard
            eyebrow="Secure sign-in"
            title="Admin sign in"
            description="Enter your assigned credentials to continue into the SheTrades control workspace."
            emailLabel="Email address"
            emailHint="Use the email assigned to your admin account."
            passwordLabel="Password"
            passwordHint="Password must match your seeded or assigned admin account."
            submitLabel="Sign in"
            loadingLabel="Signing in..."
            submitHint="Your session stays role-aware and protected as you move across the dashboard."
            recoveryAction={
              <Button variant="ghost" size="sm" onClick={() => setLoginState("help")}>
                Get sign-in help
              </Button>
            }
            value={loginValue}
            errors={{}}
            status={loginStatus}
            submitting={loginState === "loading"}
            onChange={setLoginValue}
            onSubmit={() =>
              setLoginState("loading")
            }
          />
        </AuthPageShell>
      </Card>

      <Card
        title="Profile Sidebar Card"
        description="Compact identity card for the admin shell sidebar."
      >
        <div className="admin-auth-preview__sidebar-card">
          <ProfileSidebarCard
            user={{
              ...previewUser,
              fullName: profileValue.fullName,
              avatarUrl: profileValue.avatarUrl
            }}
            href="/profile"
            label="Open profile page"
          />
        </div>
      </Card>

      <Card
        title="Profile Components"
        description="Reusable summary and forms before page composition."
      >
        <div className="admin-auth-preview__profile-grid">
          <ProfileSummaryCard
            user={{
              ...previewUser,
              fullName: profileValue.fullName,
              avatarUrl: profileValue.avatarUrl
            }}
            roleLabel="Role"
            lastSignInLabel="Last sign-in"
            noLastSignInText="Not available yet"
          />
          <ProfileDetailsForm
            title="Profile details"
            description="Keep your name and avatar current for the admin shell."
            fullNameLabel="Full name"
            fullNameHint="Displayed in the sidebar profile card and account summary."
            avatarUrlLabel="Avatar image URL"
            avatarUrlHint="Optional image. Leave blank to use initials."
            saveLabel="Save profile"
            loadingLabel="Saving..."
            value={profileValue}
            errors={{}}
            status={profileStatus}
            onChange={setProfileValue}
            onSubmit={() =>
              setProfileStatus({
                tone: "success",
                title: "Profile updated",
                description: "Your profile card now reflects the latest details."
              })
            }
          />
          <ProfilePasswordForm
            title="Change password"
            description="Rotate your password without leaving the profile workspace."
            currentPasswordLabel="Current password"
            currentPasswordHint="Enter your existing password to confirm the change."
            newPasswordLabel="New password"
            newPasswordHint="Use at least 10 characters for the new password."
            saveLabel="Update password"
            loadingLabel="Updating..."
            value={passwordValue}
            errors={{}}
            status={passwordStatus}
            onChange={setPasswordValue}
            onSubmit={() =>
              setPasswordStatus({
                tone: "success",
                title: "Password updated",
                description: "Your next sign-in will use the new password."
              })
            }
          />
        </div>
      </Card>
    </div>
  );
}
