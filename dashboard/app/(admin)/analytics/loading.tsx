import { AdminRouteLoading } from "../../../components/layout/AdminRouteLoading";

export default function AnalyticsLoading() {
  return (
    <AdminRouteLoading
      headerTitleKey="analytics.title"
      headerTitleFallback="Analytics"
      headerDescriptionKey="loading.analytics.headerDescription"
      headerDescriptionFallback="Loading analytics modules..."
      cardTitleKey="analytics.cards.funnel.title"
      cardTitleFallback="Funnel Breakdown"
      cardDescriptionKey="loading.analytics.cardDescription"
      cardDescriptionFallback="Preparing latest analytics snapshots."
      loadingLabelKey="loading.analytics.label"
      loadingLabelFallback="Loading analytics..."
    />
  );
}
