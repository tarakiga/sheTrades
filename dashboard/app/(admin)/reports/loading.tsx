import { Card, LoadingState, SectionHeader } from "../../../components/ui";

export default function ReportsLoading() {
  return (
    <main className="admin-dashboard-page">
      <SectionHeader title="Reports" description="Loading reporting workspace..." />
      <Card title="Export History" description="Fetching recent report jobs.">
        <LoadingState label="Loading reports..." />
      </Card>
    </main>
  );
}
