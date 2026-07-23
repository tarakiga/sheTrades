"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  deleteReportSchedule,
  downloadAdminCsv,
  getReportJobs,
  getReportSchedules,
  getReportsPageData,
  reportDownloadEndpoint,
  runReportScheduleNow,
  updateReportSchedule,
  type ReportJobRow,
  type ReportScheduleRow
} from "../../../lib/admin/api";
import type { ApiResult, ReportsPageData } from "../../../lib/admin/contracts";
import { fetchPublicOptionSet } from "../../../lib/config/options";
import { GenerateReportDrawer } from "../../../components/reports/GenerateReportDrawer";
import { ReportScheduleDrawer } from "../../../components/reports/ReportScheduleDrawer";
import {
  AdminReviewTableShell,
  AdminReviewWorkspace,
  Badge,
  Button,
  Card,
  ConfirmationModal,
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

  // Standing schedules (CS-7).
  const [schedules, setSchedules] = useState<ReportScheduleRow[]>([]);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [scheduleBusyId, setScheduleBusyId] = useState<string | null>(null);
  const [scheduleNote, setScheduleNote] = useState<string | null>(null);
  const [scheduleToDelete, setScheduleToDelete] = useState<ReportScheduleRow | null>(null);
  const loadSchedules = useCallback(async () => {
    const schedulesResult = await getReportSchedules();
    setSchedules(schedulesResult.data.schedules);
  }, []);
  useEffect(() => {
    void loadSchedules();
  }, [loadSchedules]);

  async function withScheduleBusy(id: string, action: () => Promise<string | null>) {
    setScheduleBusyId(id);
    setScheduleNote(null);
    try {
      const note = await action();
      if (note) setScheduleNote(note);
      await loadSchedules();
    } catch (error) {
      setScheduleNote(error instanceof Error ? error.message : "Schedule action failed.");
    } finally {
      setScheduleBusyId(null);
    }
  }

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
            description="Standing schedules that generate a report and email it automatically."
          >
            {schedules.length === 0 ? (
              <EmptyState
                title="No scheduled report jobs"
                description="Create a schedule to generate and email partner or operations reports automatically."
                action={
                  <Button variant="secondary" onClick={() => setScheduleOpen(true)}>
                    Create Schedule
                  </Button>
                }
              />
            ) : (
              <div className="schedule-list">
                <ul className="schedule-list__items">
                  {schedules.map((schedule) => {
                    const busy = scheduleBusyId === schedule.id;
                    return (
                      <li key={schedule.id} className="schedule-list__item">
                        <div className="schedule-list__head">
                          <span className="schedule-list__name">{schedule.presetLabel}</span>
                          <Badge variant={schedule.enabled ? "success" : "neutral"}>
                            {schedule.enabled ? "Active" : "Paused"}
                          </Badge>
                        </div>
                        <p className="schedule-list__meta">
                          {schedule.cadenceLabel} · {schedule.recipients.length}{" "}
                          {schedule.recipients.length === 1 ? "recipient" : "recipients"}
                        </p>
                        <p className="schedule-list__meta">
                          Next run: {new Date(schedule.nextRunAt).toLocaleString()}
                          {schedule.lastRunAt
                            ? ` · Last run ${schedule.lastRunStatus ?? "unknown"} (${new Date(schedule.lastRunAt).toLocaleString()})`
                            : " · Never run"}
                        </p>
                        <div className="schedule-list__actions">
                          <Button
                            variant="ghost"
                            size="sm"
                            disabled={busy}
                            onClick={() =>
                              void withScheduleBusy(schedule.id, async () => {
                                const result = await runReportScheduleNow(schedule.id);
                                return result.outcome.detail;
                              })
                            }
                          >
                            Run Now
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            disabled={busy}
                            onClick={() =>
                              void withScheduleBusy(schedule.id, async () => {
                                await updateReportSchedule(schedule.id, {
                                  enabled: !schedule.enabled
                                });
                                return null;
                              })
                            }
                          >
                            {schedule.enabled ? "Pause" : "Resume"}
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            disabled={busy}
                            onClick={() => setScheduleToDelete(schedule)}
                          >
                            Delete
                          </Button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
                {scheduleNote ? <p className="schedule-list__note">{scheduleNote}</p> : null}
                <Button variant="secondary" onClick={() => setScheduleOpen(true)}>
                  Create Schedule
                </Button>
              </div>
            )}
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

    <ReportScheduleDrawer
      open={scheduleOpen}
      onClose={() => setScheduleOpen(false)}
      presets={generatablePresets}
      onCreated={() => {
        void loadSchedules();
      }}
    />

    <ConfirmationModal
      open={scheduleToDelete !== null}
      title="Delete schedule?"
      description={
        scheduleToDelete
          ? `The ${scheduleToDelete.presetLabel} schedule (${scheduleToDelete.cadenceLabel}) will stop running and its recipient list will be removed. This cannot be undone.`
          : ""
      }
      confirmLabel="Delete Schedule"
      tone="danger"
      loading={scheduleBusyId === scheduleToDelete?.id}
      onCancel={() => setScheduleToDelete(null)}
      onConfirm={() => {
        if (!scheduleToDelete) return;
        const target = scheduleToDelete;
        void withScheduleBusy(target.id, async () => {
          await deleteReportSchedule(target.id);
          setScheduleToDelete(null);
          return null;
        });
      }}
    />
    </>
  );
}
