import { getRewardsPageData } from "../../../lib/admin/api";
import {
  AdminReviewTableShell,
  AdminReviewWorkspace,
  Badge,
  Button,
  Card,
  EmptyState,
  Table
} from "../../../components/ui";
import { getAdminUiCopy } from "../../../lib/config/admin-ui-copy";

export default async function RewardsPage() {
  const copy = await getAdminUiCopy();
  const t = copy.t;
  const { data, meta } = await getRewardsPageData();
  const issuedRows = data.rewards.filter((row) => row.status === "Issued");
  const pendingRows = data.rewards.filter((row) => row.status === "Pending");
  const failedRows = data.rewards.filter((row) => row.status === "Failed");
  const uniqueChannels = new Set(data.rewards.map((row) => row.channel)).size;

  return (
    <AdminReviewWorkspace
      title={t("rewards.title", "Rewards")}
      description={t(
        "rewards.description",
        "Monitor reward issuance, failures, and manual intervention workflows."
      )}
      actions={
        <div className="preview-row">
          <Badge variant={meta.source === "live" ? "success" : "warning"}>
            {meta.source === "live"
              ? t("common.liveData", "Live Data")
              : t("common.fallbackData", "Fallback Data")}
          </Badge>
          <Button>{t("rewards.actions.issueManualReward", "Issue Manual Reward")}</Button>
        </div>
      }
      {...(meta.message ? { feedback: <p className="admin-inline-note">{meta.message}</p> } : {})}
      metricsAriaLabel={t("rewards.metricsAria", "Rewards metrics")}
      metrics={[
        {
          label: t("rewards.metrics.totalRewards", "Reward Events"),
          value: String(data.rewards.length),
          trend: t("rewards.metrics.totalRewardsTrend", "Current reward log coverage"),
          status: (
            <Badge variant={data.rewards.length > 0 ? "success" : "warning"}>
              {t("rewards.metrics.coverage", "Coverage")}
            </Badge>
          )
        },
        {
          label: t("rewards.metrics.issued", "Issued"),
          value: String(issuedRows.length),
          trend: t("rewards.metrics.issuedTrend", "Successful reward fulfillment"),
          status: <Badge variant="success">{t("rewards.metrics.fulfilled", "Fulfilled")}</Badge>
        },
        {
          label: t("rewards.metrics.pending", "Pending"),
          value: String(pendingRows.length),
          trend: t("rewards.metrics.pendingTrend", "Needs operational follow-up"),
          status: (
            <Badge variant={pendingRows.length > 0 ? "warning" : "neutral"}>
              {t("rewards.metrics.followUp", "Follow-up")}
            </Badge>
          )
        },
        {
          label: t("rewards.metrics.failed", "Failed"),
          value: String(failedRows.length),
          trend: t("rewards.metrics.failedTrend", "Exceptions requiring manual attention"),
          status: (
            <Badge variant={failedRows.length > 0 ? "danger" : "neutral"}>
              {t("rewards.metrics.exceptions", "Exceptions")}
            </Badge>
          )
        }
      ]}
      primary={
        <AdminReviewTableShell
          title={t("rewards.cards.log.title", "Reward Log")}
          description={t(
            "rewards.cards.log.description",
            "Latest reward transactions and operational status."
          )}
        >
          <Table
            wrapperClassName="admin-review-table-wrap"
            tableClassName="admin-review-table"
            emptyMessage={t("rewards.empty.log", "No reward activity is available yet.")}
            columns={[
              { key: "learner", header: t("common.columns.learner", "Learner") },
              { key: "module", header: t("common.columns.module", "Module") },
              { key: "amount", header: t("common.columns.amount", "Amount") },
              { key: "channel", header: t("common.columns.channel", "Channel") },
              {
                key: "status",
                header: t("common.columns.status", "Status"),
                render: (value) => (
                  <Badge
                    variant={
                      value === "Issued" ? "success" : value === "Pending" ? "warning" : "danger"
                    }
                  >
                    {String(value)}
                  </Badge>
                )
              }
            ]}
            rows={data.rewards}
          />
        </AdminReviewTableShell>
      }
      secondary={
        <div className="admin-review-support-grid">
          <Card
            title={t("rewards.cards.exceptions.title", "Exceptions")}
            description={t(
              "rewards.cards.exceptions.description",
              "Keep failed or disputed rewards in a quieter support zone for focused follow-up."
            )}
          >
            {failedRows.length > 0 ? (
              <Table
                wrapperClassName="admin-review-table-wrap admin-review-table-wrap--compact"
                tableClassName="admin-review-table admin-review-table--compact"
                columns={[
                  { key: "learner", header: t("common.columns.learner", "Learner") },
                  { key: "module", header: t("common.columns.module", "Module") },
                  { key: "amount", header: t("common.columns.amount", "Amount") },
                  {
                    key: "status",
                    header: t("common.columns.status", "Status"),
                    render: (value) => <Badge variant="danger">{String(value)}</Badge>
                  }
                ]}
                rows={failedRows}
              />
            ) : (
              <EmptyState
                title={t("rewards.empty.exceptions.title", "No unresolved exceptions")}
                description={t(
                  "rewards.empty.exceptions.description",
                  "Failed or disputed rewards will appear here for manual follow-up."
                )}
                action={
                  <Button variant="secondary">
                    {t("rewards.actions.openReconciliation", "Open Reconciliation")}
                  </Button>
                }
              />
            )}
          </Card>

          <Card
            title={t("rewards.support.deliveryGaps.title", "Delivery Gaps")}
            description={t(
              "rewards.support.deliveryGaps.description",
              "Pending transactions remain visible without competing with the main reward log."
            )}
          >
            {pendingRows.length > 0 ? (
              <Table
                wrapperClassName="admin-review-table-wrap admin-review-table-wrap--compact"
                tableClassName="admin-review-table admin-review-table--compact"
                columns={[
                  { key: "learner", header: t("common.columns.learner", "Learner") },
                  { key: "channel", header: t("common.columns.channel", "Channel") },
                  { key: "amount", header: t("common.columns.amount", "Amount") },
                  {
                    key: "status",
                    header: t("common.columns.status", "Status"),
                    render: (value) => <Badge variant="warning">{String(value)}</Badge>
                  }
                ]}
                rows={pendingRows}
              />
            ) : (
              <p className="admin-review-support-note">
                {t(
                  "rewards.support.deliveryGaps.healthy",
                  "No pending reward deliveries need follow-up right now."
                )}
              </p>
            )}
          </Card>

          <Card
            title={t("rewards.support.automation.title", "Automation Health")}
            description={t(
              "rewards.support.automation.description",
              "Summarize fulfillment behavior and channel spread in one calmer panel."
            )}
          >
            <div className="admin-review-support-stack">
              <div className="admin-review-support-badges">
                <Badge variant={issuedRows.length > 0 ? "success" : "neutral"}>
                  {issuedRows.length} {t("rewards.support.automation.issued", "issued")}
                </Badge>
                <Badge variant={pendingRows.length > 0 ? "warning" : "neutral"}>
                  {pendingRows.length} {t("rewards.support.automation.pending", "pending")}
                </Badge>
                <Badge variant={failedRows.length > 0 ? "danger" : "neutral"}>
                  {failedRows.length} {t("rewards.support.automation.failed", "failed")}
                </Badge>
              </div>
              <p className="admin-review-support-note">
                {t(
                  "rewards.support.automation.note",
                  "Rewards are currently moving across {{count}} visible delivery channels."
                ).replace("{{count}}", String(uniqueChannels))}
              </p>
            </div>
          </Card>
        </div>
      }
    />
  );
}
