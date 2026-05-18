import { AdminRouteLoading } from "../../../../components/layout/AdminRouteLoading";

export default function ConfigOptionsLoading() {
  return (
    <AdminRouteLoading
      headerTitleKey="configOptions.title"
      headerTitleFallback="Config - Options"
      headerDescriptionKey="loading.configOptions.headerDescription"
      headerDescriptionFallback="Loading option set configuration..."
      cardTitleKey="loading.configOptions.cardTitle"
      cardTitleFallback="Published Option Sets"
      cardDescriptionKey="loading.configOptions.cardDescription"
      cardDescriptionFallback="Fetching option set documents."
      loadingLabelKey="loading.configOptions.label"
      loadingLabelFallback="Loading options config..."
    />
  );
}
