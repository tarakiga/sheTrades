import { AdminRouteLoading } from "../../../components/layout/AdminRouteLoading";

export default function ContentLoading() {
  return (
    <AdminRouteLoading
      headerTitleKey="content.title"
      headerTitleFallback="Content"
      headerDescriptionKey="loading.content.headerDescription"
      headerDescriptionFallback="Loading lesson content..."
      cardTitleKey="content.cards.library.title"
      cardTitleFallback="Lesson Library"
      cardDescriptionKey="loading.content.cardDescription"
      cardDescriptionFallback="Fetching content metadata."
      loadingLabelKey="loading.content.label"
      loadingLabelFallback="Loading lessons..."
    />
  );
}
