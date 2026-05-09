"use client";

import { useEffect } from "react";
import { Button, Card, SectionHeader } from "../../components/ui";

type AdminErrorProps = {
  error: Error & { digest?: string };
  reset: () => void;
};

export default function AdminError({ error, reset }: AdminErrorProps) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="admin-dashboard-page">
      <SectionHeader title="Admin Workspace Error" description="An unexpected error occurred." />
      <Card
        title="Unable to load this section"
        description="Try reloading the route or return later."
      >
        <div className="preview-row">
          <Button onClick={() => reset()}>Try Again</Button>
          <Button variant="secondary" onClick={() => window.location.assign("/dashboard")}>
            Return To Dashboard
          </Button>
        </div>
      </Card>
    </main>
  );
}
