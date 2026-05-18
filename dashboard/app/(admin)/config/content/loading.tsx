import { AdminRouteLoading } from "../../../../components/layout/AdminRouteLoading";

export default function ConfigContentLoading() {
  return (
    <AdminRouteLoading
      headerTitleKey="configContent.title"
      headerTitleFallback="Config - Content"
      headerDescriptionKey="loading.configContent.headerDescription"
      headerDescriptionFallback="Loading content configuration..."
      cardTitleKey="loading.configContent.cardTitle"
      cardTitleFallback="Published Content Config"
      cardDescriptionKey="loading.configContent.cardDescription"
      cardDescriptionFallback="Fetching latest published config documents."
      loadingLabelKey="loading.configContent.label"
      loadingLabelFallback="Loading content config..."
    />
  );
}
