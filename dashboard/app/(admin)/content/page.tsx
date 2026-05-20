import { ConfigAdminManager } from "../../../components/config/ConfigAdminManager";
import { ContentTranslationQueuePanel } from "../../../components/content/ContentTranslationQueuePanel";
import { Badge, SectionHeader } from "../../../components/ui";
import { getAdminUiCopy } from "../../../lib/config/admin-ui-copy";

export default async function ContentPage() {
  const copy = await getAdminUiCopy();
  const t = copy.t;

  return (
    <main className="admin-dashboard-page">
      <SectionHeader
        title={t("content.title", "Content")}
        description={t(
          "content.description",
          "Manage lessons, message copy, and learning content from one premium workspace."
        )}
        actions={
          <Badge variant={copy.source === "live" ? "success" : "danger"}>
            {copy.source === "live"
              ? t("common.liveData", "Live Data")
              : t("common.fallbackData", "Fallback Data")}
          </Badge>
        }
      />
      {copy.message ? <p className="admin-inline-note">{copy.message}</p> : null}

      <ConfigAdminManager
        namespace="content"
        defaultType="ui_copy"
        copy={copy.map}
        showAccessControls={false}
        presentation={{
          workspaceTitle: t("content.workspace.title", "Content Workspace"),
          workspaceDescription: t(
            "content.workspace.description",
            "Review, update, and publish lesson and message content from one focused workspace."
          ),
          summaryMode: "content",
          actionLabel: t("content.actions.createContent", "Create Content"),
          actionHint: t(
            "content.workspace.actionHint",
            "Add lessons and message content without leaving the main review table."
          ),
          secondaryActionLabel: t("content.actions.manageCategories", "Manage Categories"),
          tableTitle: t("content.workspace.tableTitle", "Review Content"),
          tableDescription: t(
            "content.workspace.tableDescription",
            "Open any content item to preview it, update the draft, publish changes, or move it to trash."
          ),
          emptyTitle: t("content.workspace.emptyTitle", "No Content Yet"),
          emptyDescription: t(
            "content.workspace.emptyDescription",
            "Create your first content item to start building the content library."
          )
        }}
      />

      <section className="content-page__support">
        <ContentTranslationQueuePanel />
      </section>
    </main>
  );
}
