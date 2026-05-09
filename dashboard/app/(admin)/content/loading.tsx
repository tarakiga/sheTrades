import { Card, LoadingState, SectionHeader } from "../../../components/ui";

export default function ContentLoading() {
  return (
    <main className="admin-dashboard-page">
      <SectionHeader title="Content" description="Loading lesson content..." />
      <Card title="Lesson Library" description="Fetching content metadata.">
        <LoadingState label="Loading lessons..." />
      </Card>
    </main>
  );
}
