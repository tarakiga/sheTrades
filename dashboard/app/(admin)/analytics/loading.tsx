import { Card, LoadingState, SectionHeader } from "../../../components/ui";

export default function AnalyticsLoading() {
  return (
    <main className="admin-dashboard-page">
      <SectionHeader title="Analytics" description="Loading analytics modules..." />
      <Card title="Funnel Breakdown" description="Preparing latest analytics snapshots.">
        <LoadingState label="Loading analytics..." />
      </Card>
    </main>
  );
}
