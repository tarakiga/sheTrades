"use client";

import { useEffect } from "react";
import { Button, Card, SectionHeader } from "../../components/ui";
import { useAdminUiCopyClient } from "../../lib/config/admin-ui-copy-client";

type AdminErrorProps = {
  error: Error & { digest?: string };
  reset: () => void;
};

export default function AdminError({ error, reset }: AdminErrorProps) {
  const { t } = useAdminUiCopyClient();

  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="admin-dashboard-page">
      <SectionHeader
        title={t("error.adminWorkspace.title", "Admin Workspace Error")}
        description={t("error.adminWorkspace.description", "An unexpected error occurred.")}
      />
      <Card
        title={t("error.adminWorkspace.cardTitle", "Unable to load this section")}
        description={t(
          "error.adminWorkspace.cardDescription",
          "Try reloading the route or return later."
        )}
      >
        <div className="preview-row">
          <Button onClick={() => reset()}>{t("error.adminWorkspace.tryAgain", "Try Again")}</Button>
          <Button variant="secondary" onClick={() => window.location.assign("/dashboard")}>
            {t("error.adminWorkspace.returnToDashboard", "Return To Dashboard")}
          </Button>
        </div>
      </Card>
    </main>
  );
}
