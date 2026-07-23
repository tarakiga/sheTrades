"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  downloadAdminCsv,
  getReportJobs,
  getReportsPageData,
  reportDownloadEndpoint,
  type ReportJobRow
} from "../../../lib/admin/api";
import type { ApiResult, ReportsPageData } from "../../../lib/admin/contracts";
import { fetchPublicOptionSet } from "../../../lib/config/options";
import { GenerateReportDrawer } from "../../../components/reports/GenerateReportDrawer";
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

type ReportPreset = { id: string; label: string; content: string; reportType?: string };

// Fallback dataset mapping for the three built-in presets, used when a
// published preset predates metadata.reportType. New presets should carry
// metadata.reportType in the option set instead.
const KNOWN_PRESET_REPORT_TYPES: Record<string, string> = {
  donor: "donor_summary",
  ops: "module_completion_detail",
  finance: "rewards_issuance_log"
};

// Built-in defaults; overridden by the published `reports.presets` option set.
const DEFAULT_PRESETS: ReportPreset[] = [
  {
    id: "donor",
    label: "Donor",
    content: "Impact metrics, completion funnel, reward totals.",
    reportType: "donor_summary"
  },
  {
    id: "ops",
    label: "Ops",
    content: "Daily completion deltas, drop-off list, exceptions.",
    reportType: "module_completion_detail"
  },
  {
    id: "finance",
    label: "Finance",
    content: "Reward issuance ledger and reconciliations.",
    reportType: "rewards_issuance_log"
  }
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
              typeof item.metadata.description === "string" ? item.metadata.description : item.label,
            ...(typeof item.metadata.reportType === "string"
              ? { reportType: item.metadata.reportType }
              : KNOWN_PRESET_REPORT_TYPES[item.value]
                ? { reportType: KNOWN_PRESET_REPORT_TYPES[item.value] }
                : {})
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

  // Real generated jobs (CS-6), merged ahead of the provider's export history.
  const [jobs, setJobs] = useState<ReportJobRow[]>([]);
  const [generateOpen, setGenerateOpen] = useState(false);
  const loadJobs = useCallback(async () => {
    const jobsResult = await getReportJobs();
    setJobs(jobsResult.data.jobs);
  }, []);
  useEffect(() => {
    void loadJobs();
  }, [loadJobs]);

  const presetLabelByReportType = useMemo(() => {
    const map: Record<string, string> = {};
    for (const preset of presets) {
      if (preset.reportType) map[preset.reportType] = preset.label;
    }
    return map;
  }, [presets]);

  const historyRows = useMemo(
    () => [
      ...jobs.map((job) => ({
        report: presetLabelByReportType[job.reportType] ?? job.reportType,
        format: job.format.toUpperCase(),
        generatedAt: new Date(job.createdAt).toLocaleString(),
        owner: job.requestedBy,
        status: job.status,
        exportId: job.exportId,
        fileName: job.fileName ?? ""
      })),
      ...data.exports.map((row) => ({ ...row, exportId: "", fileName: "" }))
    ],
    [jobs, presetLabelByReportType, data.exports]
  );

  const readyRows = historyRows.filter((row) => row.status === "Ready");
  const queuedRows = historyRows.filter((row) => row.status === "Queued");
  const formatCount = new Set(historyRows.map((row) => row.format)).size;

  const generatablePresets = presets.filter(
    (preset): preset is ReportPreset & { reportType: string } => Boolean(preset.reportType)
  );

  return (
    <>
    <AdminReviewWorkspace
      title="Reports"
      description="Generate donor-ready exports and monitor report pipeline health."
      actions={
        <div className="preview-row">
          <Badge variant={meta.source === "live" ? "success" : "warning"}>
            {meta.source === "live" ? "Live Data" : "Fallback Data"}
          </Badge>
          <Button onClick={() => setGenerateOpen(true)}>Generate Report</Button>
        </div>
      }
      {...(meta.message ? { feedback: <p className="admin-inline-note">{meta.message}</p> } : {})}
      metricsAriaLabel="Reports metrics"
      metrics={[
        {
          label: "Total Exports",
          value: String(historyRows.length),
          trend: "Visible export history",
          status: (
            <Badge variant={historyRows.length > 0 ? "success" : "warning"}>Coverage</Badge>
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
                  <Badge
                    variant={
                      value === "Ready" ? "success" : value === "Failed" ? "danger" : "warning"
                    }
                  >
                    {String(value)}
                  </Badge>
                )
              },
              {
                key: "exportId",
                header: "",
                render: (_value, row) =>
                  row.exportId && row.status === "Ready" ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        void downloadAdminCsv(
                          reportDownloadEndpoint(String(row.exportId)),
                          String(row.fileName || "report.csv")
                        );
                      }}
                    >
                      Download
                    </Button>
                  ) : null
              }
            ]}
            rows={historyRows}
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
              label="Report types"
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

    <GenerateReportDrawer
      open={generateOpen}
      onClose={() => setGenerateOpen(false)}
      presets={generatablePresets}
      onGenerated={() => {
        void loadJobs();
      }}
    />
    </>
  );
}
