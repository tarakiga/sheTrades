import { Card, LoadingState, SectionHeader } from "../../../components/ui";

export default function UsersLoading() {
  return (
    <main className="admin-dashboard-page">
      <SectionHeader title="Users" description="Loading user records..." />
      <Card title="Learner Directory" description="Fetching latest user state.">
        <LoadingState label="Loading users..." />
      </Card>
    </main>
  );
}
