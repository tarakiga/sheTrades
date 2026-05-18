import { AdminRouteLoading } from "../../../../components/layout/AdminRouteLoading";

export default function ConfigLegalLoading() {
  return (
    <AdminRouteLoading
      headerTitleKey="configLegal.title"
      headerTitleFallback="Config - Legal"
      headerDescriptionKey="loading.configLegal.headerDescription"
      headerDescriptionFallback="Loading legal configuration..."
      cardTitleKey="loading.configLegal.cardTitle"
      cardTitleFallback="Published Legal Blocks"
      cardDescriptionKey="loading.configLegal.cardDescription"
      cardDescriptionFallback="Fetching compliance document configuration."
      loadingLabelKey="loading.configLegal.label"
      loadingLabelFallback="Loading legal config..."
    />
  );
}
