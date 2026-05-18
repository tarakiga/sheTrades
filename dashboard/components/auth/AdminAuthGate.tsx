"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { useAdminSession } from "./AdminSessionProvider";
import { AdminRouteLoading } from "../layout/AdminRouteLoading";

export type AdminAuthGateProps = {
  children: ReactNode;
};

export function AdminAuthGate({ children }: AdminAuthGateProps) {
  const router = useRouter();
  const pathname = usePathname();
  const { status } = useAdminSession();

  useEffect(() => {
    if (status === "unauthenticated") {
      const next = pathname ? `?next=${encodeURIComponent(pathname)}` : "";
      router.replace(`/login${next}`);
    }
  }, [pathname, router, status]);

  if (status !== "authenticated") {
    return (
      <AdminRouteLoading
        headerTitleKey="auth.guard.title"
        headerTitleFallback="Preparing your admin workspace"
        headerDescriptionKey="auth.guard.description"
        headerDescriptionFallback="Checking your session before opening protected admin tools."
        cardTitleKey="auth.guard.cardTitle"
        cardTitleFallback="Secure access"
        cardDescriptionKey="auth.guard.cardDescription"
        cardDescriptionFallback="Only signed-in admins can access this part of the dashboard."
        loadingLabelKey="auth.guard.loading"
        loadingLabelFallback="Validating session..."
      />
    );
  }

  return <>{children}</>;
}
