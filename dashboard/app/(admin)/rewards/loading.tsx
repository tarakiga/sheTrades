import { Card, LoadingState, SectionHeader } from "../../../components/ui";

export default function RewardsLoading() {
  return (
    <main className="admin-dashboard-page">
      <SectionHeader title="Rewards" description="Loading reward operations..." />
      <Card title="Reward Log" description="Fetching reward transaction history.">
        <LoadingState label="Loading rewards..." />
      </Card>
    </main>
  );
}
