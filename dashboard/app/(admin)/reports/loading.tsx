import { AdminRouteLoading } from "../../../components/layout/AdminRouteLoading";

export default function ReportsLoading() {
  return (
    <AdminRouteLoading
      headerTitleKey="reports.title"
      headerTitleFallback="Reports"
      headerDescriptionKey="loading.reports.headerDescription"
      headerDescriptionFallback="Loading reporting workspace..."
      cardTitleKey="reports.cards.exportHistory.title"
      cardTitleFallback="Export History"
      cardDescriptionKey="loading.reports.cardDescription"
      cardDescriptionFallback="Fetching recent report jobs."
      loadingLabelKey="loading.reports.label"
      loadingLabelFallback="Loading reports..."
    />
  );
}
