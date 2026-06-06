"use client";

import { useEffect, useState } from "react";
import { getReportsPageData } from "../../../lib/admin/api";
import type { ApiResult, ReportsPageData } from "../../../lib/admin/contracts";
import { fetchPublicOptionSet } from "../../../lib/config/options";
import {
  AdminReviewTableShell,
  AdminReviewWorkspace,
  Badge,
  Button,
  Card,
  EmptyState,
  Table,
  Tabs
} from "../../../components/ui";

type ReportPreset = { id: string; label: string; content: string };

// Built-in defaults; overridden by the published `reports.presets` option set.
const DEFAULT_PRESETS: ReportPreset[] = [
  { id: "donor", label: "Donor", content: "Impact metrics, completion funnel, reward totals." },
  { id: "ops", label: "Ops", content: "Daily completion deltas, drop-off list, exceptions." },
  { id: "finance", label: "Finance", content: "Reward issuance ledger and reconciliations." }
];

export default function ReportsPage() {
  const [result, setResult] = useState<ApiResult<ReportsPageData> | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [presets, setPresets] = useState<ReportPreset[]>(DEFAULT_PRESETS);

  // Report presets are config-driven (admin-editable) with the defaults above
  // as the safe fallback.
  useEffect(() => {
    let cancelled = false;
    fetchPublicOptionSet("reports.presets")
      .then((items) => {
        if (cancelled || items.length === 0) return;
        setPresets(
          items.map((item) => ({
            id: item.value,
            label: item.label,
            content:
              typeof item.metadata.description === "string" ? item.metadata.description : item.label
          }))
        );
      })
      .catch(() => {
        /* keep defaults */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getReportsPageData()
      .then((next) => {
        if (!cancelled) setResult(next);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const data = result?.data ?? { exports: [] };
  const meta = result?.meta ?? { source: "fallback" as const };

  const readyRows = data.exports.filter((row) => row.status === "Ready");
  const queuedRows = data.exports.filter((row) => row.status === "Queued");
  const formatCount = new Set(data.exports.map((row) => row.format)).size;

  return (
    <AdminReviewWorkspace
      title="Reports"
      description="Generate donor-ready exports and monitor report pipeline health."
      actions={
        <div className="preview-row">
          <Badge variant={meta.source === "live" ? "success" : "warning"}>
            {meta.source === "live" ? "Live Data" : "Fallback Data"}
          </Badge>
          <Button disabled>Generate Report (coming soon)</Button>
        </div>
      }
      {...(meta.message ? { feedback: <p className="admin-inline-note">{meta.message}</p> } : {})}
      metricsAriaLabel="Reports metrics"
      metrics={[
        {
          label: "Total Exports",
          value: String(data.exports.length),
          trend: "Visible export history",
          status: (
            <Badge variant={data.exports.length > 0 ? "success" : "warning"}>Coverage</Badge>
          )
        },
        {
          label: "Ready",
          value: String(readyRows.length),
          trend: "Completed and available for download",
          status: <Badge variant="success">Completed</Badge>
        },
        {
          label: "Queued",
          value: String(queuedRows.length),
          trend: "Still processing in the pipeline",
          status: (
            <Badge variant={queuedRows.length > 0 ? "warning" : "neutral"}>Processing</Badge>
          )
        },
        {
          label: "Formats",
          value: String(formatCount),
          trend: "Distinct export outputs in view",
          status: <Badge variant="info">Dynamic</Badge>
        }
      ]}
      primary={
        <AdminReviewTableShell
          title="Export History"
          description="Recent report exports and generation status."
        >
          <Table
            wrapperClassName="admin-review-table-wrap"
            tableClassName="admin-review-table"
            emptyMessage={
              loading ? "Loading export history…" : "No export history is available yet."
            }
            columns={[
              { key: "report", header: "Report" },
              { key: "format", header: "Format" },
              { key: "generatedAt", header: "Generated At" },
              { key: "owner", header: "Owner" },
              {
                key: "status",
                header: "Status",
                render: (value) => (
                  <Badge variant={value === "Ready" ? "success" : "warning"}>{String(value)}</Badge>
                )
              }
            ]}
            rows={data.exports}
          />
        </AdminReviewTableShell>
      }
      secondary={
        <div className="admin-review-support-grid">
          <Card
            title="Report Presets"
            description="Configured export presets by stakeholder profile."
          >
            <Tabs
              activeId={presets[0]?.id ?? "donor"}
              items={presets.map((preset) => ({
                id: preset.id,
                label: preset.label,
                content: preset.content
              }))}
            />
          </Card>

          <Card
            title="Scheduled Jobs"
            description="No scheduled report jobs configured yet."
          >
            <EmptyState
              title="No scheduled report jobs"
              description="Create scheduled jobs to automatically generate donor and operations reports."
              action={
                <Button variant="secondary" disabled>
                  Create Schedule (coming soon)
                </Button>
              }
            />
          </Card>

          <Card
            title="Export Governance"
            description="Keep source and operational readiness visible without competing with export history."
          >
            <div className="admin-review-support-stack">
              <div className="admin-review-support-badges">
                <Badge variant={readyRows.length > 0 ? "success" : "neutral"}>
                  {readyRows.length} ready
                </Badge>
                <Badge variant={queuedRows.length > 0 ? "warning" : "neutral"}>
                  {queuedRows.length} queued
                </Badge>
                <Badge variant={meta.source === "live" ? "info" : "warning"}>
                  {meta.source === "live" ? "Live Data" : "Fallback Data"}
                </Badge>
              </div>
              <p className="admin-review-support-note">
                {`The current export history includes ${String(formatCount)} visible output formats for stakeholder reporting.`}
              </p>
            </div>
          </Card>
        </div>
      }
    />
  );
}
