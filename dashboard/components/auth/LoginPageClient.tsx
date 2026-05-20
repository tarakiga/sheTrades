"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAdminUiCopyClient } from "../../lib/config/admin-ui-copy-client";
import { Button, LoadingState } from "../ui";
import { AuthPageShell } from "./AuthPageShell";
import { LoginFormCard, type LoginFormValue } from "./LoginFormCard";
import { useAdminSession } from "./AdminSessionProvider";
import type { AuthStatusMessage } from "./types";
import { LoginPageFallback } from "./LoginPageFallback";

function validateLogin(value: LoginFormValue) {
  return {
    ...(value.email.trim() ? {} : { email: "Enter your admin email address." }),
    ...(value.password.trim() ? {} : { password: "Enter your password to continue." })
  };
}

export function LoginPageClient() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  const { t } = useAdminUiCopyClient();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { status, signIn } = useAdminSession();
  const [value, setValue] = useState<LoginFormValue>({ email: "", password: "" });
  const [errors, setErrors] = useState<Partial<Record<keyof LoginFormValue, string>>>({});
  const [feedback, setFeedback] = useState<AuthStatusMessage | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const nextRoute = useMemo(() => searchParams.get("next") || "/dashboard", [searchParams]);

  useEffect(() => {
    if (status === "authenticated") {
      router.replace(nextRoute);
    }
  }, [nextRoute, router, status]);

  function handleSupport() {
    setFeedback({
      tone: "info",
      title: t("auth.login.support.title", "Need help signing in?"),
      description: t(
        "auth.login.support.description",
        "Use the admin account assigned to your team. If access still fails, confirm that your account is active and your secure sign-in details are up to date."
      )
    });
  }

  function handleForgotPassword() {
    setFeedback({
      tone: "info",
      title: t("auth.login.forgotPassword.title", "Reset your password"),
      description: t(
        "auth.login.forgotPassword.description",
        "Contact your system administrator to reset your admin password. For security, password resets are handled through your organisation's IT team or the platform owner."
      )
    });
  }

  async function handleSubmit() {
    const nextErrors = validateLogin(value);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) {
      setFeedback({
        tone: "warning",
        title: t("auth.login.validation.title", "Check your sign-in details"),
        description: t(
          "auth.login.validation.description",
          "Complete the required fields before continuing."
        )
      });
      return;
    }

    setSubmitting(true);
    setFeedback({
      tone: "info",
      title: t("auth.login.progress.title", "Signing you in"),
      description: t(
        "auth.login.progress.description",
        "We are validating your admin account and preparing your workspace."
      )
    });

    try {
      await signIn(value.email.trim(), value.password);
      setFeedback({
        tone: "success",
        title: t("auth.login.success.title", "Sign-in successful"),
        description: t(
          "auth.login.success.description",
          "Your admin workspace is ready. Redirecting now."
        )
      });
      router.replace(nextRoute);
    } catch (error) {
      setFeedback({
        tone: "danger",
        title: t("auth.login.error.title", "We could not sign you in"),
        description:
          error instanceof Error
            ? error.message
            : t(
                "auth.login.error.description",
                "Check your credentials or confirm that your admin account is active."
              )
      });
    } finally {
      setSubmitting(false);
    }
  }

  if (!mounted) {
    return <LoginPageFallback />;
  }

  return (
    <main className="auth-page" suppressHydrationWarning>
      <AuthPageShell
        desktopMode="viewport-fit"
        eyebrow={t("auth.login.eyebrow", "SheTrades Admin")}
        title={t("auth.login.pageTitle", "Welcome back")}
        description={t(
          "auth.login.pageDescription",
          "Sign in with your admin account to manage content, integrations, and operational settings."
        )}
        asideLabel={t("auth.login.asideLabel", "Secure admin access")}
        asideTitle={t("auth.login.asideTitle", "Trusted operational control")}
        asideDescription={t(
          "auth.login.asideDescription",
          "Access is role-aware and session-backed so the dashboard stays secure without slowing your team down."
        )}
        asidePoints={[
          t("auth.login.point.one", "Seeded admin access for controlled platform operations"),
          t("auth.login.point.two", "Protected settings, content, and integration workspaces"),
          t("auth.login.point.three", "Profile and password self-service from one dedicated page")
        ]}
        asideHighlights={[
          {
            value: t("auth.login.aside.highlight.one.value", "Protected"),
            label: t("auth.login.aside.highlight.one.label", "Admin routes")
          },
          {
            value: t("auth.login.aside.highlight.two.value", "Live"),
            label: t("auth.login.aside.highlight.two.label", "Managed content")
          },
          {
            value: t("auth.login.aside.highlight.three.value", "Audited"),
            label: t("auth.login.aside.highlight.three.label", "Workflow changes")
          }
        ]}
        supportTitle={t("auth.login.supportRegion.title", "Controlled support access")}
        supportDescription={t(
          "auth.login.supportRegion.description",
          "Keep recovery guidance close without interrupting the main sign-in action."
        )}
        supportAction={
          <Button variant="ghost" size="sm" type="button" onClick={handleSupport}>
            {t("auth.login.supportRegion.action", "Need help signing in?")}
          </Button>
        }
        footer={
          <p className="auth-shell__footnote">
            {t(
              "auth.login.footer",
              "Use only the admin account assigned to your role. Authenticated sessions redirect directly into your protected workspace."
            )}
          </p>
        }
      >
        <LoginFormCard
          density="compact"
          emailLabel={t("auth.login.form.email.label", "Email address")}
          emailHint={t(
            "auth.login.form.email.hint",
            "Use the email assigned to your admin account."
          )}
          passwordLabel={t("auth.login.form.password.label", "Password")}
          passwordHint={t(
            "auth.login.form.password.hint",
            "Passwords are verified against your secure admin account."
          )}
          submitLabel={t("auth.login.form.submit", "Sign in")}
          loadingLabel={t("auth.login.form.loading", "Signing in...")}
          submitHint={t(
            "auth.login.form.submitHint",
            "Your session stays role-aware and protected as you move across the dashboard."
          )}
          recoveryAction={
            <Button variant="ghost" size="sm" type="button" onClick={handleSupport}>
              {t("auth.login.form.recovery", "Get sign-in help")}
            </Button>
          }
          forgotPasswordAction={
            <button
              type="button"
              className="auth-login-card__forgot-link"
              onClick={handleForgotPassword}
            >
              {t("auth.login.form.forgotPassword", "Forgot password?")}
            </button>
          }
          value={value}
          errors={errors}
          status={feedback}
          submitting={submitting}
          onChange={setValue}
          onSubmit={() => {
            void handleSubmit();
          }}
        />
      </AuthPageShell>
    </main>
  );
}
