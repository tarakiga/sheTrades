import { AdminRouteLoading } from "../../../components/layout/AdminRouteLoading";

export default function SettingsLoadingPage() {
  return (
    <AdminRouteLoading
      headerTitleKey="settings.title"
      headerTitleFallback="Settings"
      headerDescriptionKey="loading.settings.headerDescription"
      headerDescriptionFallback="Loading configuration workspace..."
      cardTitleKey="loading.settings.cardTitle"
      cardTitleFallback="Settings Workspace"
      cardDescriptionKey="loading.settings.cardDescription"
      cardDescriptionFallback="Preparing configuration tabs and current data context."
      loadingLabelKey="loading.settings.label"
      loadingLabelFallback="Loading settings workspace..."
    />
  );
}
