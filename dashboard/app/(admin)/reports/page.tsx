import { getReportsPageData } from "../../../lib/admin/api";
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
import { getAdminUiCopy } from "../../../lib/config/admin-ui-copy";

export default async function ReportsPage() {
  const copy = await getAdminUiCopy();
  const t = copy.t;
  const { data, meta } = await getReportsPageData();
  const readyRows = data.exports.filter((row) => row.status === "Ready");
  const queuedRows = data.exports.filter((row) => row.status === "Queued");
  const formatCount = new Set(data.exports.map((row) => row.format)).size;

  return (
    <AdminReviewWorkspace
      title={t("reports.title", "Reports")}
      description={t(
        "reports.description",
        "Generate donor-ready exports and monitor report pipeline health."
      )}
      actions={
        <div className="preview-row">
          <Badge variant={meta.source === "live" ? "success" : "warning"}>
            {meta.source === "live"
              ? t("common.liveData", "Live Data")
              : t("common.fallbackData", "Fallback Data")}
          </Badge>
          <Button>{t("reports.actions.generateReport", "Generate Report")}</Button>
        </div>
      }
      {...(meta.message ? { feedback: <p className="admin-inline-note">{meta.message}</p> } : {})}
      metricsAriaLabel={t("reports.metricsAria", "Reports metrics")}
      metrics={[
        {
          label: t("reports.metrics.totalExports", "Total Exports"),
          value: String(data.exports.length),
          trend: t("reports.metrics.totalExportsTrend", "Visible export history"),
          status: (
            <Badge variant={data.exports.length > 0 ? "success" : "warning"}>
              {t("reports.metrics.coverage", "Coverage")}
            </Badge>
          )
        },
        {
          label: t("reports.metrics.ready", "Ready"),
          value: String(readyRows.length),
          trend: t("reports.metrics.readyTrend", "Completed and available for download"),
          status: <Badge variant="success">{t("reports.metrics.completed", "Completed")}</Badge>
        },
        {
          label: t("reports.metrics.queued", "Queued"),
          value: String(queuedRows.length),
          trend: t("reports.metrics.queuedTrend", "Still processing in the pipeline"),
          status: (
            <Badge variant={queuedRows.length > 0 ? "warning" : "neutral"}>
              {t("reports.metrics.processing", "Processing")}
            </Badge>
          )
        },
        {
          label: t("reports.metrics.formats", "Formats"),
          value: String(formatCount),
          trend: t("reports.metrics.formatsTrend", "Distinct export outputs in view"),
          status: <Badge variant="info">{t("reports.metrics.dynamic", "Dynamic")}</Badge>
        }
      ]}
      primary={
        <AdminReviewTableShell
          title={t("reports.cards.exportHistory.title", "Export History")}
          description={t(
            "reports.cards.exportHistory.description",
            "Recent report exports and generation status."
          )}
        >
          <Table
            wrapperClassName="admin-review-table-wrap"
            tableClassName="admin-review-table"
            emptyMessage={t("reports.empty.history", "No export history is available yet.")}
            columns={[
              { key: "report", header: t("common.columns.report", "Report") },
              { key: "format", header: t("common.columns.format", "Format") },
              { key: "generatedAt", header: t("reports.columns.generatedAt", "Generated At") },
              { key: "owner", header: t("common.columns.owner", "Owner") },
              {
                key: "status",
                header: t("common.columns.status", "Status"),
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
            title={t("reports.cards.presets.title", "Report Presets")}
            description={t(
              "reports.cards.presets.description",
              "Configured export presets by stakeholder profile."
            )}
          >
            <Tabs
              activeId="donor"
              items={[
                {
                  id: "donor",
                  label: t("reports.tabs.donor", "Donor"),
                  content: t(
                    "reports.tabs.donorContent",
                    "Impact metrics, completion funnel, reward totals."
                  )
                },
                {
                  id: "ops",
                  label: t("reports.tabs.ops", "Ops"),
                  content: t(
                    "reports.tabs.opsContent",
                    "Daily completion deltas, drop-off list, exceptions."
                  )
                },
                {
                  id: "finance",
                  label: t("reports.tabs.finance", "Finance"),
                  content: t(
                    "reports.tabs.financeContent",
                    "Reward issuance ledger and reconciliations."
                  )
                }
              ]}
            />
          </Card>

          <Card
            title={t("reports.cards.scheduledJobs.title", "Scheduled Jobs")}
            description={t(
              "reports.cards.scheduledJobs.description",
              "No scheduled report jobs configured yet."
            )}
          >
            <EmptyState
              title={t("reports.empty.scheduledJobs.title", "No scheduled report jobs")}
              description={t(
                "reports.empty.scheduledJobs.description",
                "Create scheduled jobs to automatically generate donor and operations reports."
              )}
              action={
                <Button variant="secondary">
                  {t("reports.actions.createSchedule", "Create Schedule")}
                </Button>
              }
            />
          </Card>

          <Card
            title={t("reports.support.governance.title", "Export Governance")}
            description={t(
              "reports.support.governance.description",
              "Keep source and operational readiness visible without competing with export history."
            )}
          >
            <div className="admin-review-support-stack">
              <div className="admin-review-support-badges">
                <Badge variant={readyRows.length > 0 ? "success" : "neutral"}>
                  {readyRows.length} {t("reports.support.governance.ready", "ready")}
                </Badge>
                <Badge variant={queuedRows.length > 0 ? "warning" : "neutral"}>
                  {queuedRows.length} {t("reports.support.governance.queued", "queued")}
                </Badge>
                <Badge variant={meta.source === "live" ? "info" : "warning"}>
                  {meta.source === "live"
                    ? t("common.liveData", "Live Data")
                    : t("common.fallbackData", "Fallback Data")}
                </Badge>
              </div>
              <p className="admin-review-support-note">
                {t(
                  "reports.support.governance.note",
                  "The current export history includes {{count}} visible output formats for stakeholder reporting."
                ).replace("{{count}}", String(formatCount))}
              </p>
            </div>
          </Card>
        </div>
      }
    />
  );
}
