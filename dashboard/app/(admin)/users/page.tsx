import { getUsersPageData } from "../../../lib/admin/api";
import {
  AdminActionRail,
  AdminReviewTableShell,
  AdminReviewWorkspace,
  Badge,
  Button,
  Card,
  EmptyState,
  Table
} from "../../../components/ui";
import { getAdminUiCopy } from "../../../lib/config/admin-ui-copy";

function parsePercent(value: string) {
  const parsed = Number.parseFloat(value.replace("%", ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

export default async function UsersPage() {
  const copy = await getAdminUiCopy();
  const t = copy.t;
  const { data, meta } = await getUsersPageData();
  const activeCount = data.users.filter((row) => row.status === "Active").length;
  const atRiskCount = data.users.filter((row) => row.status === "At Risk").length;
  const uniqueLanguages = new Set(data.users.map((row) => row.language)).size;
  const completionAverage =
    data.users.length === 0
      ? "0%"
      : `${(
          data.users.reduce((total, row) => total + parsePercent(row.completion), 0) / data.users.length
        ).toFixed(1)}%`;
  const topLocations = Array.from(
    data.users.reduce<Map<string, number>>((accumulator, row) => {
      accumulator.set(row.location, (accumulator.get(row.location) ?? 0) + 1);
      return accumulator;
    }, new Map())
  )
    .sort((left, right) => right[1] - left[1])
    .slice(0, 3);
  const topLanguages = Array.from(
    data.users.reduce<Map<string, number>>((accumulator, row) => {
      accumulator.set(row.language, (accumulator.get(row.language) ?? 0) + 1);
      return accumulator;
    }, new Map())
  )
    .sort((left, right) => right[1] - left[1])
    .slice(0, 3);

  return (
    <AdminReviewWorkspace
      title={t("users.title", "Users")}
      description={t(
        "users.description",
        "Review learner records, spot emerging follow-up needs, and keep the directory ready for action."
      )}
      actions={
        <div className="preview-row">
          <Badge variant={meta.source === "live" ? "success" : "warning"}>
            {meta.source === "live"
              ? t("common.liveData", "Live Data")
              : t("common.fallbackData", "Fallback Data")}
          </Badge>
          <Button>{t("users.actions.exportUsers", "Export Users")}</Button>
        </div>
      }
      {...(meta.message
        ? { feedback: <p className="admin-inline-note">{meta.message}</p> }
        : {})}
      metricsAriaLabel={t("users.metricsAria", "User directory metrics")}
      metrics={[
        {
          label: t("users.metrics.totalLearners", "Total Learners"),
          value: String(data.users.length),
          trend: t("users.metrics.totalLearnersTrend", "Current directory coverage"),
          status: (
            <Badge variant={data.users.length > 0 ? "success" : "warning"}>
              {t("users.metrics.coverage", "Coverage")}
            </Badge>
          )
        },
        {
          label: t("users.metrics.activeLearners", "Active Learners"),
          value: String(activeCount),
          trend: t("users.metrics.activeLearnersTrend", "Healthy engagement status"),
          status: <Badge variant="success">{t("users.metrics.healthy", "Healthy")}</Badge>
        },
        {
          label: t("users.metrics.atRiskLearners", "At-Risk Learners"),
          value: String(atRiskCount),
          trend: t("users.metrics.atRiskLearnersTrend", "Needs follow-up attention"),
          status: (
            <Badge variant={atRiskCount > 0 ? "warning" : "neutral"}>
              {t("users.metrics.followUp", "Follow-up")}
            </Badge>
          )
        },
        {
          label: t("users.metrics.averageCompletion", "Average Completion"),
          value: completionAverage,
          trend: t("users.metrics.averageCompletionTrend", "Across visible learner records"),
          status: <Badge variant="info">{t("users.metrics.dynamic", "Dynamic")}</Badge>
        }
      ]}
      primary={
        <AdminReviewTableShell
          title={t("users.cards.directory.title", "Learner Directory")}
          description={t(
            "users.cards.directory.description",
            "Scan learner identity, progress, and follow-up state from one calmer review surface."
          )}
        >
          <Table
            wrapperClassName="admin-review-table-wrap"
            tableClassName="admin-review-table admin-review-table--users"
            emptyMessage={t("users.empty.directory", "No learner records are available yet.")}
            columns={[
              {
                key: "name",
                header: t("common.columns.name", "Name"),
                render: (value, row) => (
                  <div className="users-directory__identity">
                    <span className="users-directory__name">{String(value)}</span>
                    <span className="users-directory__meta">{row.phone}</span>
                  </div>
                )
              },
              { key: "location", header: t("common.columns.location", "Location") },
              { key: "language", header: t("common.columns.language", "Language") },
              {
                key: "completion",
                header: t("common.columns.completion", "Completion"),
                render: (value, row) => (
                  <div className="users-directory__progress">
                    <span className="users-directory__progress-value">{String(value)}</span>
                    <span className="users-directory__meta">
                      {row.status === "At Risk"
                        ? t("users.progress.followUp", "Needs follow-up")
                        : t("users.progress.onTrack", "On track")}
                    </span>
                  </div>
                )
              },
              {
                key: "status",
                header: t("common.columns.status", "Status"),
                render: (value) => (
                  <Badge variant={value === "Active" ? "success" : "warning"}>
                    {String(value)}
                  </Badge>
                )
              },
              {
                key: "phone",
                header: "",
                render: (value) => (
                  <AdminActionRail
                    actions={[
                      {
                        id: `${String(value)}-preview`,
                        label: t("users.actions.previewReady", "Preview learner profile"),
                        icon: "preview",
                        disabled: true
                      },
                      {
                        id: `${String(value)}-message`,
                        label: t("users.actions.messageReady", "Contact learner"),
                        icon: "message",
                        disabled: true
                      },
                      {
                        id: `${String(value)}-flag`,
                        label: t("users.actions.flagReady", "Flag for follow-up"),
                        icon: "flag",
                        tone: "danger",
                        disabled: true
                      }
                    ]}
                  />
                )
              }
            ]}
            rows={data.users}
          />
        </AdminReviewTableShell>
      }
      secondary={
        <div className="admin-review-support-grid">
          <Card
            title={t("users.support.coverage.title", "Directory Coverage")}
            description={t(
              "users.support.coverage.description",
              "Use this support view to understand where the visible directory is strongest."
            )}
          >
            <div className="admin-review-support-stack">
              <div className="admin-review-support-block">
                <p className="admin-review-support-label">
                  {t("users.support.coverage.locations", "Top locations")}
                </p>
                {topLocations.length > 0 ? (
                  <ul className="admin-review-support-list">
                    {topLocations.map(([location, count]) => (
                      <li key={location}>
                        <span>{location}</span>
                        <strong>{count}</strong>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="admin-review-support-note">
                    {t(
                      "users.support.coverage.locationsEmpty",
                      "Location coverage will appear once learner records are available."
                    )}
                  </p>
                )}
              </div>

              <div className="admin-review-support-block">
                <p className="admin-review-support-label">
                  {t("users.support.coverage.languages", "Top languages")}
                </p>
                {topLanguages.length > 0 ? (
                  <ul className="admin-review-support-list">
                    {topLanguages.map(([language, count]) => (
                      <li key={language}>
                        <span>{language}</span>
                        <strong>{count}</strong>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="admin-review-support-note">
                    {t(
                      "users.support.coverage.languagesEmpty",
                      "Language distribution will appear once learner records are available."
                    )}
                  </p>
                )}
              </div>
            </div>
          </Card>

          <Card
            title={t("users.cards.actions.title", "User Actions")}
            description={t(
              "users.cards.actions.description",
              "Keep import follow-up, moderation, and preview work staged in one secondary zone."
            )}
          >
            <EmptyState
              title={t("users.empty.actions.title", "No pending user actions")}
              description={t(
                "users.empty.actions.description",
                "Bulk import errors, duplicate merges, and live moderation actions will appear here."
              )}
              action={
                <Button variant="secondary">
                  {t("users.actions.createImportBatch", "Create Import Batch")}
                </Button>
              }
            />
          </Card>

          <Card
            title={t("users.support.futureActions.title", "Preview-Ready Action Rail")}
            description={t(
              "users.support.futureActions.description",
              "The directory already reserves space for profile previews, outreach, and follow-up actions."
            )}
          >
            <div className="admin-review-support-stack">
              <p className="admin-review-support-note">
                {t(
                  "users.support.futureActions.note",
                  "Row actions stay compact and icon-first so future side drawers and moderation tools can be added without redesigning the table."
                )}
              </p>
              <div className="admin-review-support-badges">
                <Badge variant="info">
                  {t("users.support.futureActions.badgePreview", "Preview Ready")}
                </Badge>
                <Badge variant="neutral">
                  {uniqueLanguages} {t("users.support.futureActions.badgeLanguages", "languages visible")}
                </Badge>
              </div>
            </div>
          </Card>
        </div>
      }
    />
  );
}
