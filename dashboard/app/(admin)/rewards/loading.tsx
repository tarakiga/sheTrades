import { AdminRouteLoading } from "../../../components/layout/AdminRouteLoading";

export default function RewardsLoading() {
  return (
    <AdminRouteLoading
      headerTitleKey="rewards.title"
      headerTitleFallback="Rewards"
      headerDescriptionKey="loading.rewards.headerDescription"
      headerDescriptionFallback="Loading reward operations..."
      cardTitleKey="rewards.cards.log.title"
      cardTitleFallback="Reward Log"
      cardDescriptionKey="loading.rewards.cardDescription"
      cardDescriptionFallback="Fetching reward transaction history."
      loadingLabelKey="loading.rewards.label"
      loadingLabelFallback="Loading rewards..."
    />
  );
}
