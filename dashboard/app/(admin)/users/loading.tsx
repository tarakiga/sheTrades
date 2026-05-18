import { AdminRouteLoading } from "../../../components/layout/AdminRouteLoading";

export default function UsersLoading() {
  return (
    <AdminRouteLoading
      headerTitleKey="users.title"
      headerTitleFallback="Users"
      headerDescriptionKey="loading.users.headerDescription"
      headerDescriptionFallback="Loading user records..."
      cardTitleKey="users.cards.directory.title"
      cardTitleFallback="Learner Directory"
      cardDescriptionKey="loading.users.cardDescription"
      cardDescriptionFallback="Fetching latest user state."
      loadingLabelKey="loading.users.label"
      loadingLabelFallback="Loading users..."
    />
  );
}
