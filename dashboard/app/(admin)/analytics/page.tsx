"use client";

import { useEffect, useState } from "react";
import { getAnalyticsPageData } from "../../../lib/admin/api";
import type { AnalyticsPageData, ApiResult } from "../../../lib/admin/contracts";
import {
  AdminInsightPanel,
  AdminInsightSurface,
  AdminReviewWorkspace,
  Badge,
  Button,
  Card,
  EmptyState,
  LoadingState,
  Tabs
} from "../../../components/ui";

function toNumber(value: string) {
  const parsed = Number.parseFloat(value.replace("%", ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

const FALLBACK_DATA: AnalyticsPageData = {
  registrationRate: "0%",
  completionRate: "0%",
  passRate: "0%",
  funnelOverall: "No published analytics funnel configuration available.",
  funnelAnambra: "No state analytics available.",
  funnelDelta: "No state analytics available."
};

export default function AnalyticsPage() {
  const [result, setResult] = useState<ApiResult<AnalyticsPageData> | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    getAnalyticsPageData()
      .then((r) => {
        if (!cancelled) setResult(r);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const data = result?.data ?? FALLBACK_DATA;
  const meta = result?.meta ?? { source: "fallback" as const };

  const funnelReady = !data.funnelOverall.startsWith("No published");
  const registrationRate = toNumber(data.registrationRate);
  const completionRate = toNumber(data.completionRate);
  const passRate = toNumber(data.passRate);

  return (
    <AdminReviewWorkspace
      title="Analytics"
      description="Track registration, progression, and quiz performance across modules."
      actions={
        <div className="preview-row">
          <Badge variant={meta.source === "live" ? "success" : "warning"}>
            {meta.source === "live" ? "Live Data" : "Fallback Data"}
          </Badge>
          <Button disabled>Download CSV (coming soon)</Button>
        </div>
      }
      {...(meta.message ? { feedback: <p className="admin-inline-note">{meta.message}</p> } : {})}
      metricsAriaLabel="Analytics metrics"
      metrics={
        loading
          ? []
          : [
              {
                label: "Registration Rate",
                value: data.registrationRate,
                trend: "Top-of-funnel learner conversion",
                status: (
                  <Badge variant={registrationRate > 0 ? "success" : "warning"}>Coverage</Badge>
                )
              },
              {
                label: "Module Completion",
                value: data.completionRate,
                trend: "Progression through active modules",
                status: (
                  <Badge variant={completionRate >= 30 ? "success" : "warning"}>Progression</Badge>
                )
              },
              {
                label: "Quiz Pass Rate",
                value: data.passRate,
                trend: "Assessment signal across learners",
                status: (
                  <Badge variant={passRate >= 70 ? "success" : "info"}>Assessment</Badge>
                )
              }
            ]
      }
      primary={
        loading ? (
          <LoadingState label="Loading analytics..." />
        ) : (
          <AdminInsightSurface
            title="Analytics Review Canvas"
            description="Lead with the strongest interpretive signals, then keep supporting status and notes quieter."
            summary={
              <div className="admin-insight-surface__badge-row">
                <Badge variant={funnelReady ? "success" : "warning"}>
                  {funnelReady ? "Funnel Ready" : "Funnel Pending"}
                </Badge>
                <Badge variant={meta.source === "live" ? "info" : "neutral"}>
                  {meta.source === "live" ? "Dynamic" : "Safe Fallback"}
                </Badge>
              </div>
            }
            lead={
              <AdminInsightPanel
                title="Funnel Breakdown"
                description="Learner progression through onboarding and modules."
              >
                <Tabs
                  activeId="overall"
                  items={[
                    {
                      id: "overall",
                      label: "Overall",
                      content: data.funnelOverall
                    },
                    {
                      id: "anambra",
                      label: "Anambra",
                      content: data.funnelAnambra
                    },
                    {
                      id: "delta",
                      label: "Delta",
                      content: data.funnelDelta
                    }
                  ]}
                />
              </AdminInsightPanel>
            }
            aside={
              <>
                <AdminInsightPanel
                  title="Performance Signals"
                  description="Keep the core completion and assessment indicators visible beside the funnel."
                >
                  <div className="admin-insight-signal-list">
                    <div className="admin-insight-signal-item">
                      <span className="admin-insight-signal-item__label">Module Completion</span>
                      <strong className="admin-insight-signal-item__value">{data.completionRate}</strong>
                    </div>
                    <div className="admin-insight-signal-item">
                      <span className="admin-insight-signal-item__label">Quiz Pass Rate</span>
                      <strong className="admin-insight-signal-item__value">{data.passRate}</strong>
                    </div>
                    <div className="admin-insight-signal-item">
                      <span className="admin-insight-signal-item__label">Registration Rate</span>
                      <strong className="admin-insight-signal-item__value">{data.registrationRate}</strong>
                    </div>
                  </div>
                </AdminInsightPanel>

                <AdminInsightPanel
                  title="Analytics Source"
                  description="Figures are computed from the WhatsApp events pipeline."
                >
                  <p className="admin-review-support-note">
                    Live streaming is not enabled yet — reload this page to pull the latest
                    snapshot from the events pipeline.
                  </p>
                </AdminInsightPanel>
              </>
            }
          />
        )
      }
      secondary={
        loading ? undefined : (
          <div className="admin-review-support-grid">
            <Card
              title="Interpretation Notes"
              description="Keep the clearest operator guidance in a calmer support zone."
            >
              <div className="admin-review-support-stack">
                <p className="admin-review-support-note">
                  Registration rate shows how well the top of the funnel is converting into active learner records.
                </p>
                <p className="admin-review-support-note">
                  Completion and pass rate should be reviewed together to separate learning friction from assessment weakness.
                </p>
              </div>
            </Card>

            <Card
              title="Source Health"
              description="Review whether analytics signals are live, degraded, or operating from fallback content."
            >
              <div className="admin-review-support-stack">
                <div className="admin-review-support-badges">
                  <Badge variant={meta.source === "live" ? "success" : "warning"}>
                    {meta.source === "live" ? "Live Data" : "Fallback Data"}
                  </Badge>
                  <Badge variant={funnelReady ? "info" : "neutral"}>
                    {funnelReady ? "Published Funnel" : "Awaiting Funnel"}
                  </Badge>
                </div>
                <p className="admin-review-support-note">
                  {meta.message ?? "Analytics signals are available and ready for review."}
                </p>
              </div>
            </Card>

            <Card
              title="Publishing Readiness"
              description="Use this zone for missing setup steps and lower-priority follow-up."
            >
              {funnelReady ? (
                <p className="admin-review-support-note">
                  The funnel snapshot is published, so cohort and state views are ready for interpretation.
                </p>
              ) : (
                <EmptyState
                  title="Analytics funnel still needs setup"
                  description="Publish the funnel configuration to unlock more useful progression analysis here."
                  action={
                    <Button variant="secondary" disabled>
                      Review Analytics Setup (coming soon)
                    </Button>
                  }
                />
              )}
            </Card>
          </div>
        )
      }
    />
  );
}
