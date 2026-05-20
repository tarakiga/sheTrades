import { getAnalyticsPageData } from "../../../lib/admin/api";
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
import { getAdminUiCopy } from "../../../lib/config/admin-ui-copy";

function toNumber(value: string) {
  const parsed = Number.parseFloat(value.replace("%", ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

export default async function AnalyticsPage() {
  const copy = await getAdminUiCopy();
  const t = copy.t;
  const { data, meta } = await getAnalyticsPageData();
  const funnelReady = !data.funnelOverall.startsWith("No published");
  const registrationRate = toNumber(data.registrationRate);
  const completionRate = toNumber(data.completionRate);
  const passRate = toNumber(data.passRate);

  return (
    <AdminReviewWorkspace
      title={t("analytics.title", "Analytics")}
      description={t(
        "analytics.description",
        "Track registration, progression, and quiz performance across modules."
      )}
      actions={
        <div className="preview-row">
          <Badge variant={meta.source === "live" ? "success" : "danger"}>
            {meta.source === "live"
              ? t("common.liveData", "Live Data")
              : t("common.fallbackData", "Fallback Data")}
          </Badge>
          <Button>{t("analytics.actions.downloadCsv", "Download Analytics CSV")}</Button>
        </div>
      }
      {...(meta.message ? { feedback: <p className="admin-inline-note">{meta.message}</p> } : {})}
      metricsAriaLabel={t("analytics.metricsAria", "Analytics metrics")}
      metrics={[
        {
          label: t("analytics.metrics.registrationRate", "Registration Rate"),
          value: data.registrationRate,
          trend: t("analytics.trends.registrationRate", "Top-of-funnel learner conversion"),
          status: (
            <Badge variant={registrationRate > 0 ? "success" : "warning"}>
              {t("analytics.badges.coverage", "Coverage")}
            </Badge>
          )
        },
        {
          label: t("analytics.metrics.moduleCompletion", "Module Completion"),
          value: data.completionRate,
          trend: t("analytics.trends.moduleCompletion", "Progression through active modules"),
          status: (
            <Badge variant={completionRate >= 30 ? "success" : "warning"}>
              {t("analytics.badges.progression", "Progression")}
            </Badge>
          )
        },
        {
          label: t("analytics.metrics.quizPassRate", "Quiz Pass Rate"),
          value: data.passRate,
          trend: t("analytics.trends.quizPassRate", "Assessment signal across learners"),
          status: (
            <Badge variant={passRate >= 70 ? "success" : "info"}>
              {t("analytics.badges.assessment", "Assessment")}
            </Badge>
          )
        }
      ]}
      primary={
        <AdminInsightSurface
          title={t("analytics.workspace.primary.title", "Analytics Review Canvas")}
          description={t(
            "analytics.workspace.primary.description",
            "Review key performance signals and learner funnel progression."
          )}
          summary={
            <div className="admin-insight-surface__badge-row">
              <Badge variant={funnelReady ? "success" : "warning"}>
                {funnelReady
                  ? t("analytics.badges.funnelReady", "Funnel Ready")
                  : t("analytics.badges.funnelPending", "Funnel Pending")}
              </Badge>
              <Badge variant={meta.source === "live" ? "info" : "neutral"}>
                {meta.source === "live"
                  ? t("analytics.badges.dynamic", "Dynamic")
                  : t("analytics.badges.safeFallback", "Safe Fallback")}
              </Badge>
            </div>
          }
          lead={
            <AdminInsightPanel
              title={t("analytics.cards.funnel.title", "Funnel Breakdown")}
              description={t(
                "analytics.cards.funnel.description",
                "Learner progression through onboarding and modules."
              )}
            >
              {funnelReady ? (
                <Tabs
                  activeId="overall"
                  items={[
                    {
                      id: "overall",
                      label: t("analytics.tabs.overall", "Overall"),
                      content: data.funnelOverall
                    },
                    {
                      id: "anambra",
                      label: t("analytics.tabs.anambra", "Anambra"),
                      content: data.funnelAnambra
                    },
                    {
                      id: "delta",
                      label: t("analytics.tabs.delta", "Delta"),
                      content: data.funnelDelta
                    }
                  ]}
                />
              ) : (
                <EmptyState
                  icon="analytics"
                  title={t("analytics.empty.funnel.title", "Enrol learners to see analytics")}
                  description={t(
                    "analytics.empty.funnel.description",
                    "Connect your data pipeline or wait for the first learning events to generate the funnel snapshot."
                  )}
                  action={
                    <Button 
                      variant="primary" 
                      style={{ background: "var(--color-info)", borderColor: "var(--color-info)", color: "#ffffff" }}
                    >
                      {t("analytics.actions.enrolLearnerCTA", "Enrol your first learner")}
                    </Button>
                  }
                />
              )}
            </AdminInsightPanel>
          }
          aside={
            <>
              <AdminInsightPanel
                title={t("analytics.cards.signals.title", "Performance Signals")}
                description={t(
                  "analytics.cards.signals.description",
                  "Overview of core completion and assessment indicators."
                )}
              >
                <div className="admin-insight-signal-list">
                  <div className="admin-insight-signal-item">
                    <span className="admin-insight-signal-item__label">
                      {t("analytics.metrics.moduleCompletion", "Module Completion")}
                    </span>
                    <strong className="admin-insight-signal-item__value">{data.completionRate}</strong>
                  </div>
                  <div className="admin-insight-signal-item">
                    <span className="admin-insight-signal-item__label">
                      {t("analytics.metrics.quizPassRate", "Quiz Pass Rate")}
                    </span>
                    <strong className="admin-insight-signal-item__value">{data.passRate}</strong>
                  </div>
                  <div className="admin-insight-signal-item">
                    <span className="admin-insight-signal-item__label">
                      {t("analytics.metrics.registrationRate", "Registration Rate")}
                    </span>
                    <strong className="admin-insight-signal-item__value">{data.registrationRate}</strong>
                  </div>
                </div>
              </AdminInsightPanel>

              <AdminInsightPanel
                title={t("analytics.cards.realtime.title", "Realtime Sync")}
                description={t(
                  "analytics.cards.realtime.description",
                  "Streaming analytics updates from WhatsApp events pipeline."
                )}
              >
                <LoadingState
                  label={t("analytics.loading.refreshing", "Refreshing analytics stream...")}
                />
              </AdminInsightPanel>
            </>
          }
        />
      }
      secondary={
        <div className="admin-review-support-grid">
          <Card
            title={t("analytics.support.interpretation.title", "Interpretation Notes")}
            description={t(
              "analytics.support.interpretation.description",
              "Guidance for interpreting current metrics and trends."
            )}
          >
            <div className="admin-review-support-stack">
              <p className="admin-review-support-note">
                {t(
                  "analytics.support.interpretation.note1",
                  "Registration rate shows how well the top of the funnel is converting into active learner records."
                )}
              </p>
              <p className="admin-review-support-note">
                {t(
                  "analytics.support.interpretation.note2",
                  "Completion and pass rate should be reviewed together to separate learning friction from assessment weakness."
                )}
              </p>
            </div>
          </Card>

          <Card
            title={t("analytics.support.sourceHealth.title", "Source Health")}
            description={t(
              "analytics.support.sourceHealth.description",
              "Review whether analytics signals are live, degraded, or operating from fallback content."
            )}
          >
            <div className="admin-review-support-stack">
              <div className="admin-review-support-badges">
                <Badge variant={meta.source === "live" ? "success" : "danger"}>
                  {meta.source === "live"
                    ? t("common.liveData", "Live Data")
                    : t("common.fallbackData", "Fallback Data")}
                </Badge>
                <Badge variant={funnelReady ? "info" : "neutral"}>
                  {funnelReady
                    ? t("analytics.support.sourceHealth.funnelReady", "Published Funnel")
                    : t("analytics.support.sourceHealth.funnelMissing", "Awaiting Funnel")}
                </Badge>
              </div>
              <p className="admin-review-support-note">
                {meta.message ??
                  t(
                    "analytics.support.sourceHealth.healthy",
                    "Analytics signals are available and ready for review."
                  )}
              </p>
            </div>
          </Card>

          <Card
            title={t("analytics.support.readiness.title", "Publishing Readiness")}
            description={t(
              "analytics.support.readiness.description",
              "Track configuration and publishing status of analytics features."
            )}
          >
            {funnelReady ? (
              <p className="admin-review-support-note">
                {t(
                  "analytics.support.readiness.ready",
                  "The funnel snapshot is published, so cohort and state views are ready for interpretation."
                )}
              </p>
            ) : (
              <EmptyState
                icon="config"
                title={t("analytics.empty.readiness.title", "Analytics funnel still needs setup")}
                description={t(
                  "analytics.empty.readiness.description",
                  "Publish the funnel configuration to unlock more useful progression analysis here."
                )}
                action={
                  <Button variant="secondary">
                    {t("analytics.actions.reviewSetup", "Review Analytics Setup")}
                  </Button>
                }
              />
            )}
          </Card>
        </div>
      }
    />
  );
}
