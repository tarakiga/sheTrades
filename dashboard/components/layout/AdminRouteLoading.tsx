"use client";

import { Card, LoadingState, SectionHeader } from "../ui";
import { useAdminUiCopyClient } from "../../lib/config/admin-ui-copy-client";

type AdminRouteLoadingProps = {
  headerTitleKey: string;
  headerTitleFallback: string;
  headerDescriptionKey: string;
  headerDescriptionFallback: string;
  cardTitleKey: string;
  cardTitleFallback: string;
  cardDescriptionKey: string;
  cardDescriptionFallback: string;
  loadingLabelKey: string;
  loadingLabelFallback: string;
};

export function AdminRouteLoading(props: AdminRouteLoadingProps) {
  const { t } = useAdminUiCopyClient();

  return (
    <main className="admin-dashboard-page">
      <SectionHeader
        title={t(props.headerTitleKey, props.headerTitleFallback)}
        description={t(props.headerDescriptionKey, props.headerDescriptionFallback)}
      />
      <Card
        title={t(props.cardTitleKey, props.cardTitleFallback)}
        description={t(props.cardDescriptionKey, props.cardDescriptionFallback)}
      >
        <LoadingState label={t(props.loadingLabelKey, props.loadingLabelFallback)} />
      </Card>
    </main>
  );
}
