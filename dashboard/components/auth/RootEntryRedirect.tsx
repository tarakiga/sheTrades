"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAdminUiCopyClient } from "../../lib/config/admin-ui-copy-client";
import { Badge, LoadingState } from "../ui";
import { AuthPageShell } from "./AuthPageShell";
import { useAdminSession } from "./AdminSessionProvider";
import { useBranding } from "../branding/BrandingProvider";

export type RootEntryRedirectProps = {
  statusOverride?: "loading" | "authenticated" | "unauthenticated";
};

function getEntryPresentation(
  status: "loading" | "authenticated" | "unauthenticated",
  t: (key: string, fallback: string) => string,
  orgName: string
) {
  switch (status) {
    case "authenticated":
      return {
        heroBadge: t("auth.entry.badge.authenticated", "Secure entry"),
        title: t("auth.entry.authenticated.title", "Opening your dashboard"),
        description: t(
          "auth.entry.authenticated.description",
          `Your admin session is active. We are taking you into the ${orgName} control workspace now.`
        ),
        loadingLabel: t("auth.entry.authenticated.loading", "Opening dashboard..."),
        asideTitle: t("auth.entry.authenticated.asideTitle", "Verified admin session"),
        asideDescription: t(
          "auth.entry.authenticated.asideDescription",
          "Access has already been confirmed, so the platform is routing you directly to the protected workspace."
        ),
        footer: t(
          "auth.entry.authenticated.footer",
          "Verified sessions skip the public entry layer and continue straight into dashboard operations."
        )
      };
    case "unauthenticated":
      return {
        heroBadge: t("auth.entry.badge.unauthenticated", "Secure entry"),
        title: t("auth.entry.unauthenticated.title", "Taking you to sign in"),
        description: t(
          "auth.entry.unauthenticated.description",
          "We did not find an active admin session, so we are routing you to the secure sign-in experience."
        ),
        loadingLabel: t("auth.entry.unauthenticated.loading", "Opening sign-in..."),
        asideTitle: t("auth.entry.unauthenticated.asideTitle", "Protected admin access"),
        asideDescription: t(
          "auth.entry.unauthenticated.asideDescription",
          "The entry route keeps the homepage focused and sends unauthenticated visitors directly into the controlled login flow."
        ),
        footer: t(
          "auth.entry.unauthenticated.footer",
          "Unauthenticated visitors are redirected into the dedicated sign-in flow before any admin workspace is shown."
        )
      };
    default:
      return {
        heroBadge: t("auth.entry.badge.loading", "Preparing access"),
        title: t("auth.entry.loading.title", "Preparing your workspace"),
        description: t(
          "auth.entry.loading.description",
          `Checking your admin session and routing you into the right ${orgName} entry experience.`
        ),
        loadingLabel: t("auth.entry.loading.loading", "Preparing workspace..."),
        asideTitle: t("auth.entry.loading.asideTitle", "Calm entry handoff"),
        asideDescription: t(
          "auth.entry.loading.asideDescription",
          "The root route stays clean and intentional while session state resolves in the background."
        ),
        footer: t(
          "auth.entry.loading.footer",
          "This short handoff prevents the old design-review homepage from appearing in production."
        )
      };
  }
}

export function RootEntryRedirect({ statusOverride }: RootEntryRedirectProps) {
  const { t } = useAdminUiCopyClient();
  const branding = useBranding();
  const router = useRouter();
  const { status } = useAdminSession();
  const resolvedStatus = statusOverride ?? status;
  const presentation = getEntryPresentation(resolvedStatus, t, branding.organisationName);

  useEffect(() => {
    if (statusOverride) {
      return;
    }

    if (status === "authenticated") {
      router.replace("/dashboard");
      return;
    }

    if (status === "unauthenticated") {
      router.replace("/login");
    }
  }, [router, status, statusOverride]);

  return (
    <main className="auth-page">
      <AuthPageShell
        eyebrow={t("auth.entry.eyebrow", `${branding.organisationName} Admin`)}
        title={presentation.title}
        description={presentation.description}
        heroBadge={<Badge variant="info">{presentation.heroBadge}</Badge>}
        asideLabel={t("auth.entry.asideLabel", "Application entry")}
        asideTitle={presentation.asideTitle}
        asideDescription={presentation.asideDescription}
        asideHighlights={[
          {
            value: t("auth.entry.highlight.one.value", "Smart"),
            label: t("auth.entry.highlight.one.label", "Root routing")
          },
          {
            value: t("auth.entry.highlight.two.value", "Protected"),
            label: t("auth.entry.highlight.two.label", "Admin access")
          },
          {
            value: t("auth.entry.highlight.three.value", "Calm"),
            label: t("auth.entry.highlight.three.label", "Handoff state")
          }
        ]}
        asidePoints={[
          t("auth.entry.point.one", "Authenticated admins continue straight into the dashboard"),
          t("auth.entry.point.two", "Unauthenticated visitors move directly into the secure login flow"),
          t("auth.entry.point.three", "The production homepage no longer exposes the token review surface")
        ]}
        footer={<p className="auth-shell__footnote">{presentation.footer}</p>}
      >
        <div className="ui-card auth-login-card">
          <div className="auth-login-card__content">
            <LoadingState label={presentation.loadingLabel} />
          </div>
        </div>
      </AuthPageShell>
    </main>
  );
}
