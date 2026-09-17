"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  deleteReportSchedule,
  downloadAdminCsv,
  generateReport,
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
import { formatWat } from "../../../lib/admin/wat";
import { fetchPublicOptionSet } from "../../../lib/config/options";
import { ReportScheduleDrawer } from "../../../components/reports/ReportScheduleDrawer";
import type { GeneratablePreset, PresetAudience } from "../../../components/reports/presets";
import {
  ActionCard,
  AdminReviewTableShell,
  AdminReviewWorkspace,
  Badge,
  Button,
  Card,
  ConfirmationModal,
  EmptyState,
  SectionHeader,
  Table
} from "../../../components/ui";

type ReportPreset = {
  id: string;
  label: string;
  content: string;
  reportType?: string;
  audience?: PresetAudience;
  personalData?: boolean;
};

// Fallbacks for presets published before metadata.reportType / metadata.audience
// existed. New presets should carry both in the option set instead.
const KNOWN_PRESET_REPORT_TYPES: Record<string, string> = {
  donor: "donor_summary",
  journey: "learner_journey",
  me: "me_participants",
  ops: "module_completion_detail",
  finance: "rewards_issuance_log"
};
const KNOWN_PRESET_AUDIENCE: Record<string, PresetAudience> = {
  donor: "donor",
  journey: "donor",
  me: "internal",
  ops: "internal",
  finance: "internal"
};
const KNOWN_PRESET_PERSONAL_DATA: Record<string, boolean> = { me: true };

// Built-in defaults; overridden by the published `reports.presets` option set.
const DEFAULT_PRESETS: ReportPreset[] = [
  {
    id: "donor",
    label: "Donor",
    content: "Impact metrics, completion funnel, reward totals.",
    reportType: "donor_summary",
    audience: "donor"
  },
  {
    id: "ops",
    label: "Ops",
    content: "Daily completion deltas, drop-off list, exceptions.",
    reportType: "module_completion_detail",
    audience: "internal"
  },
  {
    id: "finance",
    label: "Finance",
    content: "Reward issuance ledger and reconciliations.",
    reportType: "rewards_issuance_log",
    audience: "internal"
  },
  {
    id: "journey",
    label: "Learner journey",
    content:
      "One row per learner: enrolment, module and course completion times (WAT), days to complete, certificate, airtime. Pseudonymous refs, no phone numbers.",
    reportType: "learner_journey",
    audience: "donor"
  },
  {
    id: "me",
    label: "M&E participant report",
    content:
      "One row per participant with name and phone, state, a status per module, course status, and start/completion times (WAT).",
    reportType: "me_participants",
    audience: "internal",
    personalData: true
  }
];

function audienceBadge(preset: ReportPreset): { label: string; variant: "teal" | "warning" } | undefined {
  if (preset.audience === "donor") return { label: "For donors", variant: "teal" };
  if (preset.audience === "internal") return { label: "Internal", variant: "warning" };
  return undefined;
}

export default function ReportsPage() {
  const [result, setResult] = useState<ApiResult<ReportsPageData> | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [presets, setPresets] = useState<ReportPreset[]>(DEFAULT_PRESETS);
  // A download that fails used to fail silently (a floating promise). Say so.
  const [downloadNote, setDownloadNote] = useState<string | null>(null);
  // One card is generating at a time; its button shows the wait.
  const [generatingId, setGeneratingId] = useState<string | null>(null);
  const [generateNote, setGenerateNote] = useState<string | null>(null);

  // Report presets are config-driven (admin-editable) with the defaults above
  // as the safe fallback.
  useEffect(() => {
    let cancelled = false;
    fetchPublicOptionSet("reports.presets")
      .then((items) => {
        if (cancelled || items.length === 0) return;
        setPresets(
          items.map((item) => {
            const audience =
              item.metadata.audience === "donor" || item.metadata.audience === "internal"
                ? item.metadata.audience
                : KNOWN_PRESET_AUDIENCE[item.value];
            const personalData =
              typeof item.metadata.personalData === "boolean"
                ? item.metadata.personalData
                : KNOWN_PRESET_PERSONAL_DATA[item.value];
            return {
              id: item.value,
              label: item.label,
              content:
                typeof item.metadata.description === "string" ? item.metadata.description : item.label,
              ...(typeof item.metadata.reportType === "string"
                ? { reportType: item.metadata.reportType }
                : KNOWN_PRESET_REPORT_TYPES[item.value]
                  ? { reportType: KNOWN_PRESET_REPORT_TYPES[item.value] }
                  : {}),
              ...(audience ? { audience } : {}),
              ...(personalData ? { personalData } : {})
            };
          })
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

  // Generated jobs, kept by the backend and listed ahead of the provider's history.
  const [jobs, setJobs] = useState<ReportJobRow[]>([]);
  const [retentionDays, setRetentionDays] = useState<number | null>(null);
  const loadJobs = useCallback(async () => {
    const jobsResult = await getReportJobs();
    setJobs(jobsResult.data.jobs);
    setRetentionDays(jobsResult.data.retentionDays ?? null);
  }, []);
  useEffect(() => {
    void loadJobs();
  }, [loadJobs]);

  // Standing schedules.
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

  const generatablePresets = useMemo(
    () =>
      presets.filter(
        (preset): preset is ReportPreset & { reportType: string } => Boolean(preset.reportType)
      ) as GeneratablePreset[],
    [presets]
  );

  async function handleGenerate(preset: ReportPreset & { reportType: string }) {
    setGeneratingId(preset.id);
    setGenerateNote(null);
    setDownloadNote(null);
    try {
      await generateReport(preset.reportType);
      setGenerateNote(`${preset.label} is ready. Download it from the history below.`);
      await loadJobs();
    } catch (error) {
      setGenerateNote(
        `${preset.label} could not be generated: ${error instanceof Error ? error.message : "unknown error"}`
      );
    } finally {
      setGeneratingId(null);
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
        generatedAt: formatWat(job.createdAt) || job.createdAt,
        owner: job.requestedBy,
        status: job.status,
        exportId: job.exportId,
        fileName: job.fileName ?? ""
      })),
      ...data.exports.map((row) => ({
        report: row.report,
        generatedAt: formatWat(row.generatedAt) || row.generatedAt,
        owner: row.owner,
        status: row.status,
        exportId: "",
        fileName: ""
      }))
    ],
    [jobs, presetLabelByReportType, data.exports]
  );

  const readyRows = historyRows.filter((row) => row.status === "Ready");
  const queuedRows = historyRows.filter((row) => row.status === "Queued");
  const activeSchedules = schedules.filter((schedule) => schedule.enabled).length;
  const feedback = generateNote ?? downloadNote ?? meta.message;

  return (
    <>
      <AdminReviewWorkspace
        title="Reports"
        description="Generate an export, or let a schedule send it for you."
        actions={
          <Badge variant={meta.source === "live" ? "success" : "warning"}>
            {meta.source === "live" ? "Live Data" : "Fallback Data"}
          </Badge>
        }
        {...(feedback ? { feedback: <p className="admin-inline-note">{feedback}</p> } : {})}
        metricsAriaLabel="Reports metrics"
        metrics={[
          {
            label: "Presets",
            value: String(generatablePresets.length),
            trend: "Ready to generate",
            status: <Badge variant="info">Config-driven</Badge>
          },
          {
            label: "Exports ready",
            value: String(readyRows.length),
            trend: "Available for download",
            status: <Badge variant={readyRows.length > 0 ? "success" : "neutral"}>Completed</Badge>
          },
          {
            label: "Queued",
            value: String(queuedRows.length),
            trend: "Still processing",
            status: <Badge variant={queuedRows.length > 0 ? "warning" : "neutral"}>Processing</Badge>
          },
          {
            label: "Active schedules",
            value: `${activeSchedules} of ${schedules.length}`,
            trend: activeSchedules === schedules.length ? "All schedules running" : "Some schedules paused",
            status: (
              <Badge variant={schedules.length === 0 ? "neutral" : activeSchedules === schedules.length ? "success" : "warning"}>
                Schedules
              </Badge>
            )
          }
        ]}
        primary={
          <>
            <section className="report-presets" aria-labelledby="report-presets-title">
              <SectionHeader
                title="Generate a report"
                description="Each preset is one click. The file lands in the history below."
              />
              {generatablePresets.length === 0 ? (
                <EmptyState
                  title="No report presets are configured"
                  description="Add presets with a reportType under Settings → Options (reports.presets)."
                />
              ) : (
                <div className="report-preset-grid">
                  {generatablePresets.map((preset) => {
                    const busy = generatingId === preset.id;
                    const badge = audienceBadge(preset);
                    return (
                      <ActionCard
                        key={preset.id}
                        title={preset.label}
                        description={preset.content}
                        {...(badge ? { badge } : {})}
                        {...(preset.personalData
                          ? { note: "Contains personal data. For the team only; not for sharing outside the organisation." }
                          : {})}
                        action={
                          <Button
                            variant="secondary"
                            loading={busy}
                            disabled={generatingId !== null && !busy}
                            onClick={() => void handleGenerate(preset)}
                          >
                            {busy ? "Generating" : "Generate"}
                          </Button>
                        }
                      />
                    );
                  })}
                </div>
              )}
            </section>

            <div className="admin-review-split">
              <AdminReviewTableShell
                title="Export History"
                description="Generated reports, newest first. Times are West Africa Time."
                actions={
                  <div className="preview-row">
                    <Badge variant={readyRows.length > 0 ? "success" : "neutral"}>{readyRows.length} ready</Badge>
                    <Badge variant={queuedRows.length > 0 ? "warning" : "neutral"}>{queuedRows.length} queued</Badge>
                    {retentionDays !== null ? <Badge variant="info">Kept {retentionDays} days</Badge> : null}
                  </div>
                }
              >
                <Table
                  wrapperClassName="admin-review-table-wrap"
                  tableClassName="admin-review-table"
                  emptyMessage={
                    loading ? "Loading export history…" : "Nothing generated yet. Pick a preset above."
                  }
                  columns={[
                    { key: "report", header: "Report" },
                    { key: "generatedAt", header: "Generated (WAT)" },
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
                              setDownloadNote(null);
                              downloadAdminCsv(
                                reportDownloadEndpoint(String(row.exportId)),
                                String(row.fileName || "report.csv")
                              ).catch((error: unknown) => {
                                setDownloadNote(
                                  `Download failed: ${error instanceof Error ? error.message : "unknown error"}. Generate the report again if it has expired.`
                                );
                              });
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

              <Card
                title="Scheduled Jobs"
                description="Standing schedules that generate a report and email it automatically."
                actions={
                  <Button variant="secondary" size="sm" onClick={() => setScheduleOpen(true)}>
                    Create Schedule
                  </Button>
                }
              >
                {schedules.length === 0 ? (
                  <EmptyState
                    title="No scheduled report jobs"
                    description="Create a schedule to generate and email partner or operations reports automatically."
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
                              Next run: {formatWat(schedule.nextRunAt) || schedule.nextRunAt} WAT
                              {schedule.lastRunAt
                                ? ` · Last run ${schedule.lastRunStatus ?? "unknown"} (${formatWat(schedule.lastRunAt) || schedule.lastRunAt})`
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
                  </div>
                )}
              </Card>
            </div>
          </>
        }
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
