import {
  AnalyticsRewardsReportsWorkspacePreview
} from "./AnalyticsRewardsReportsWorkspacePreview";
import {
  AdminWorkspaceMetricStrip,
  Badge,
  Button,
  Card,
  ConfigDocumentCard,
  ConstraintMeter,
  EmptyState,
  Input,
  LoadingState,
  OptionSetEditor,
  PublishWorkflowPanel,
  SectionHeader,
  StatCard,
  Table
} from "../../../components/ui";
import { AdminSessionProvider } from "../../../components/auth/AdminSessionProvider";
import { AdminShell } from "../../../components/layout/AdminShell";
import { getAdminUiCopy } from "../../../lib/config/admin-ui-copy";
import { AdminAuthPreview } from "./AdminAuthPreview";
import { GuidedSettingsWorkspacePreview } from "./GuidedSettingsWorkspacePreview";
import { IntegrationWorkspacePreview } from "./IntegrationWorkspacePreview";
import { OverlayPreviewDemo } from "./OverlayPreviewDemo";
import { OverviewUsersWorkspacePreview } from "./OverviewUsersWorkspacePreview";
import { PayoutsIntegrationPreview } from "./PayoutsIntegrationPreview";
import { TranslationSettingsPreview } from "./TranslationSettingsPreview";
import { TranslationReviewPreview } from "./TranslationReviewPreview";
import { AdminTeamWorkspacePreview } from "./AdminTeamWorkspacePreview";
import { BrandingEditorPreview } from "./BrandingEditorPreview";
import { GuidedTourPreview } from "./GuidedTourPreview";
import { PreviewEditorsDemo } from "./PreviewEditorsDemo";
import { HelpRequestsPanelPreview } from "./HelpRequestsPanelPreview";
import { QuizBuilderPreview } from "./QuizBuilderPreview";
import { PreviewSelectTabsDemo } from "./PreviewSelectTabsDemo";
import { AdminRouteLoading } from "../../../components/layout/AdminRouteLoading";
import { RewardsWorkspacePreview } from "./RewardsWorkspacePreview";
import { TranslationRequestWorkflowPreview } from "./TranslationRequestWorkflowPreview";
import { UsersWorkspacePreview } from "./UsersWorkspacePreview";

type LearnerRow = {
  name: string;
  state: string;
  completion: string;
  status: string;
};

export default async function ComponentsPreviewPage() {
  const copy = await getAdminUiCopy();
  const t = copy.t;
  const learnerRows: Array<LearnerRow> = [
    {
      name: t("preview.data.learner1.name", "Amaka Obi"),
      state: t("preview.data.learner1.state", "Anambra"),
      completion: "78%",
      status: t("preview.data.status.active", "Active")
    },
    {
      name: t("preview.data.learner2.name", "Ruth Okon"),
      state: t("preview.data.learner2.state", "Delta"),
      completion: "34%",
      status: t("preview.data.status.atRisk", "At Risk")
    }
  ];
  const languageOptions = [
    {
      id: "opt-1",
      value: "en",
      label: t("preview.select.language.english", "English"),
      enabled: true,
      sortOrder: 1
    },
    {
      id: "opt-2",
      value: "pcm",
      label: t("preview.select.language.pidgin", "Pidgin"),
      enabled: true,
      sortOrder: 2
    },
    {
      id: "opt-3",
      value: "ig",
      label: t("preview.select.language.igbo", "Igbo"),
      enabled: false,
      sortOrder: 3
    }
  ];
  return (
    <main className="preview-page">
      <SectionHeader
        title={t("preview.components.title", "Component Library Preview")}
        description={t(
          "preview.components.description",
          "Review reusable component states before they are composed into product pages."
        )}
        actions={<Badge variant="info">{t("preview.components.badge", "Preview v1")}</Badge>}
      />

      <div className="preview-grid">
        <Card
          title={t("preview.buttons.title", "Buttons")}
          description={t(
            "preview.buttons.description",
            "Primary, secondary, ghost, danger, loading, and disabled states."
          )}
        >
          <div className="preview-card-content">
            <div className="preview-row">
              <Button variant="primary">{t("preview.buttons.primary", "Primary")}</Button>
              <Button variant="secondary">{t("preview.buttons.secondary", "Secondary")}</Button>
              <Button variant="ghost">{t("preview.buttons.ghost", "Ghost")}</Button>
              <Button variant="danger">{t("preview.buttons.danger", "Danger")}</Button>
            </div>
            <div className="preview-row">
              <Button size="sm">{t("preview.buttons.small", "Small")}</Button>
              <Button size="md">{t("preview.buttons.medium", "Medium")}</Button>
              <Button size="lg">{t("preview.buttons.large", "Large")}</Button>
              <Button loading>{t("preview.buttons.loading", "Loading")}</Button>
              <Button disabled>{t("preview.buttons.disabled", "Disabled")}</Button>
            </div>
          </div>
        </Card>

        <Card
          title={t("preview.inputs.title", "Inputs")}
          description={t("preview.inputs.description", "Label, hint, and validation error states.")}
        >
          <div className="preview-card-content">
            <Input
              id="name"
              label={t("preview.inputs.learnerName.label", "Learner Name")}
              placeholder={t("preview.inputs.learnerName.placeholder", "Enter full name")}
              hint={t("preview.inputs.learnerName.hint", "As shown on registration.")}
            />
            <Input
              id="phone"
              label={t("preview.inputs.phone.label", "Phone Number")}
              placeholder={t("preview.inputs.phone.placeholder", "+234...")}
              defaultValue="08000000000"
              error={t("preview.inputs.phone.error", "Invalid phone format.")}
            />
          </div>
        </Card>

        <Card
          title={t("preview.badges.title", "Badges")}
          description={t(
            "preview.badges.description",
            "Semantic and neutral status labels for analytics and workflow state."
          )}
        >
          <div className="preview-row">
            <Badge variant="neutral">{t("preview.badges.draft", "Draft")}</Badge>
            <Badge variant="info">{t("preview.badges.inReview", "In Review")}</Badge>
            <Badge variant="success">{t("preview.badges.active", "Active")}</Badge>
            <Badge variant="warning">{t("preview.badges.pending", "Pending")}</Badge>
            <Badge variant="danger">{t("preview.badges.failed", "Failed")}</Badge>
          </div>
        </Card>

        <Card
          title={t("preview.constraintMeter.title", "Constraint Meter")}
          description={t(
            "preview.constraintMeter.description",
            "Live WhatsApp character-budget feedback: green = standard, yellow = breathing room, red = over. Counts bot-added chars via systemChars."
          )}
        >
          <div style={{ display: "grid", gap: "var(--space-4)", maxWidth: "420px" }}>
            <ConstraintMeter label="Standard (green)" used={9} limit={20} overflow="truncate" />
            <ConstraintMeter label="Breathing room (yellow)" used={18} limit={20} overflow="truncate" />
            <ConstraintMeter label="Over limit (red)" used={24} limit={20} overflow="truncate" />
            <ConstraintMeter
              label="With bot overhead"
              used={946}
              limit={1024}
              systemChars={120}
              overflow="reject"
            />
          </div>
        </Card>

        <Card
          title={t("preview.metricStrip.title", "Admin Workspace Metric Strip")}
          description={t(
            "preview.metricStrip.description",
            "The KPI row used at the top of every admin workspace. Takes a required ariaLabel so screen readers can name the group."
          )}
        >
          <AdminWorkspaceMetricStrip
            ariaLabel={t("preview.metricStrip.aria", "Example workspace metrics")}
            metrics={[
              {
                label: "Registration Rate",
                value: "72%",
                trend: "Top-of-funnel learner conversion",
                status: <Badge variant="success">Coverage</Badge>
              },
              {
                label: "Module Completion",
                value: "34%",
                trend: "Progression through active modules",
                status: <Badge variant="warning">Progression</Badge>
              },
              {
                label: "Quiz Pass Rate",
                value: "68%",
                trend: "Assessment signal across learners",
                status: <Badge variant="info">Assessment</Badge>
              }
            ]}
          />
        </Card>

        <Card
          title={t("preview.editors.title", "Rich Text Editor + Textarea")}
          description={t(
            "preview.editors.description",
            "Controlled text inputs used by the content wizard. RichTextEditor writes WhatsApp markdown (*bold*, _italics_); Textarea covers raw payloads and notes, with hint and error states."
          )}
        >
          <PreviewEditorsDemo />
        </Card>

        <Card
          title={t("preview.quizBuilder.title", "Lesson Quiz Builder")}
          description={t(
            "preview.quizBuilder.description",
            "Step 3 of the content wizard. The fixture holds both question types: a knowledge question with a correct answer, and a check-in where every answer is accepted and one option is marked as a help request (which flags the learner for follow-up)."
          )}
        >
          <QuizBuilderPreview />
        </Card>

        <Card
          title={t("preview.helpRequests.title", "Users Requesting Help")}
          description={t(
            "preview.helpRequests.description",
            "Overview panel listing learners who tapped the help option during a lesson check-in. Shown with rows, empty, and loading - including a request with no captured name, where the phone number is what makes it actionable."
          )}
        >
          <HelpRequestsPanelPreview />
        </Card>

        <Card
          title={t("preview.routeLoading.title", "Admin Route Loading")}
          description={t(
            "preview.routeLoading.description",
            "The shared skeleton rendered by every admin route's loading.tsx while its data resolves. All copy is config-driven with safe fallbacks."
          )}
        >
          <AdminRouteLoading
            headerTitleKey="preview.routeLoading.headerTitle"
            headerTitleFallback="Learners"
            headerDescriptionKey="preview.routeLoading.headerDescription"
            headerDescriptionFallback="Review learner progress and follow-up status."
            cardTitleKey="preview.routeLoading.cardTitle"
            cardTitleFallback="Learner Directory"
            cardDescriptionKey="preview.routeLoading.cardDescription"
            cardDescriptionFallback="Fetching the latest learner records."
            loadingLabelKey="preview.routeLoading.loadingLabel"
            loadingLabelFallback="Loading learners..."
          />
        </Card>

        <Card
          title={t("preview.selectTabs.title", "Select + Tabs")}
          description={t(
            "preview.selectTabs.description",
            "Form selection and tab navigation primitives."
          )}
        >
          <PreviewSelectTabsDemo
            selectLabel={t("preview.select.language.label", "Preferred Language")}
            selectHint={t("preview.select.language.hint", "Used for lesson text and audio defaults.")}
            selectOptions={[
              { label: t("preview.select.language.english", "English"), value: "en" },
              { label: t("preview.select.language.pidgin", "Pidgin"), value: "pcm" },
              { label: t("preview.select.language.igbo", "Igbo"), value: "ig" }
            ]}
            tabs={[
              {
                id: "users",
                label: t("preview.tabs.users.label", "Users"),
                content: t("preview.tabs.users.content", "User analytics module content preview.")
              },
              {
                id: "content",
                label: t("preview.tabs.content.label", "Content"),
                content: t(
                  "preview.tabs.content.content",
                  "Learning content module content preview."
                )
              },
              {
                id: "rewards",
                label: t("preview.tabs.rewards.label", "Rewards"),
                content: t(
                  "preview.tabs.rewards.content",
                  "Reward processing module content preview."
                )
              }
            ]}
          />
        </Card>

        <Card
          title={t("preview.tableStat.title", "Table + StatCard")}
          description={t(
            "preview.tableStat.description",
            "Data display primitives for dashboard analytics pages."
          )}
        >
          <div className="preview-card-content">
            <div className="ui-stat-grid">
              <StatCard
                label={t("preview.stats.registeredUsers.label", "Registered Users")}
                value="20,412"
                trend={t("preview.stats.registeredUsers.trend", "+12.4% this month")}
              />
              <StatCard
                label={t("preview.stats.moduleCompletion.label", "Module Completion")}
                value="34.8%"
                trend={t("preview.stats.moduleCompletion.trend", "+4.2% this week")}
                status={<Badge variant="success">{t("preview.stats.onTrack", "On Track")}</Badge>}
              />
            </div>
            <Table
              columns={[
                { key: "name", header: t("preview.table.columns.name", "Name") },
                { key: "state", header: t("preview.table.columns.state", "State") },
                { key: "completion", header: t("preview.table.columns.completion", "Completion") },
                {
                  key: "status",
                  header: t("preview.table.columns.status", "Status"),
                  render: (value) => (
                    <Badge
                      variant={
                        value === t("preview.data.status.active", "Active") ? "success" : "warning"
                      }
                    >
                      {String(value)}
                    </Badge>
                  )
                }
              ]}
              rows={learnerRows}
            />
          </div>
        </Card>

        <Card
          title={t("preview.emptyLoading.title", "Empty + Loading States")}
          description={t(
            "preview.emptyLoading.description",
            "Graceful empty and loading placeholders."
          )}
        >
          <div className="preview-card-content">
            <LoadingState
              label={t("preview.emptyLoading.loadingLabel", "Loading learner analytics...")}
            />
            <EmptyState
              title={t("preview.emptyLoading.emptyTitle", "No rewards issued yet")}
              description={t(
                "preview.emptyLoading.emptyDescription",
                "Rewards will appear here once learners complete milestone quizzes."
              )}
              action={
                <Button variant="secondary">
                  {t("preview.emptyLoading.issueManualReward", "Issue Manual Reward")}
                </Button>
              }
            />
          </div>
        </Card>

        <Card
          title={t("preview.integrationWorkspace.title", "Integration Workspace")}
          description={t(
            "preview.integrationWorkspace.description",
            "Preview managed provider tabs, secure drafts, masked previews, and connection-testing drawers."
          )}
        >
          <IntegrationWorkspacePreview />
        </Card>

        <Card
          title={t("preview.overviewUsers.title", "Overview + Users Workspace")}
          description={t(
            "preview.overviewUsers.description",
            "Preview the shared premium workspace pattern used to align overview and users with the newer admin system."
          )}
        >
          <OverviewUsersWorkspacePreview />
        </Card>

        <Card
          title={t("preview.usersWorkspace.title", "Users Workspace - Learner Detail Drawer")}
          description={t(
            "preview.usersWorkspace.description",
            "Preview the learner detail drawer: identity, follow-up flag, session, progress, quiz attempts, and rewards sections."
          )}
        >
          <UsersWorkspacePreview />
        </Card>

        <Card
          title={t("preview.analyticsRewardsReports.title", "Analytics + Rewards + Reports")}
          description={t(
            "preview.analyticsRewardsReports.description",
            "Preview the insight-led analytics surface and the shared table-led parity pattern for rewards and reports."
          )}
        >
          <AnalyticsRewardsReportsWorkspacePreview />
        </Card>

        <Card
          title={t("preview.rewardsHealthHero.title", "Rewards Health Hero")}
          description={t(
            "preview.rewardsHealthHero.description",
            "Preview the issuance gauge, total-paid headline, attention panel, and hero / banner states."
          )}
        >
          <RewardsWorkspacePreview />
        </Card>

        <Card
          title={t(
            "preview.payoutsIntegration.title",
            "Payouts Integration - provider + credentials"
          )}
          description={t(
            "preview.payoutsIntegration.description",
            "Preview the three payouts providers, the sandbox toggle, disabled state, and field-level error states."
          )}
        >
          <PayoutsIntegrationPreview />
        </Card>

        <Card
          title={t(
            "preview.translationSettings.title",
            "Translation Settings - provider config + test connection"
          )}
          description={t(
            "preview.translationSettings.description",
            "Preview the Translations settings tab: per-language provider selects (Pidgin excludes Igbo API), Igbo API/Gemini/Anthropic credential fields, the connection test result badge, and field-level error states."
          )}
        >
          <TranslationSettingsPreview />
        </Card>

        <Card
          title={t(
            "preview.translationReview.title",
            "Translation Review - run, gauges, approve/promote"
          )}
          description={t(
            "preview.translationReview.description",
            "Preview the Translations REVIEW workspace: run panel, draft list with status/flag badges, and the review panel with live WhatsApp character gauges - including a red over-limit title, a red over-limit quiz option, and a failed option needing manual entry."
          )}
        >
          <TranslationReviewPreview />
        </Card>

        <Card
          title={t("preview.adminTeam.title", "Admin Team - manage admins & roles")}
          description={t(
            "preview.adminTeam.description",
            "Preview the admin directory: inline role assignment, active/suspended status, and per-row suspend/reactivate with self-action guards."
          )}
        >
          <AdminTeamWorkspacePreview />
        </Card>

        <Card
          title={t("preview.brandingEditor.title", "Branding Editor - white-label controls")}
          description={t(
            "preview.brandingEditor.description",
            "Preview the Settings → Branding editor: grouped identity/palette/typography sections, swatch-card colour fields with hex readouts, and a live preview that re-themes as you edit."
          )}
        >
          <BrandingEditorPreview />
        </Card>

        <Card
          title={t("preview.guidedTour.title", "Guided Tour - interactive walkthrough")}
          description={t(
            "preview.guidedTour.description",
            "Spotlight onboarding tour: dimmed backdrop, animated highlight, progress dots, keyboard support, and centered intro/outro steps."
          )}
        >
          <GuidedTourPreview />
        </Card>

        <Card
          title={t("preview.adminAuth.title", "Admin Login + Profile")}
          description={t(
            "preview.adminAuth.description",
            "Preview the premium sign-in shell, sidebar profile card, and reusable profile forms before page composition."
          )}
        >
          <AdminAuthPreview />
        </Card>

        <Card
          title={t("preview.translationWorkflow.title", "Translation Request Workflow")}
          description={t(
            "preview.translationWorkflow.description",
            "Preview the translation queue panel and request drawer before they are used in the content workspace."
          )}
        >
          <TranslationRequestWorkflowPreview />
        </Card>

        <Card
          title={t("preview.overlay.title", "Drawer + Confirmation")}
          description={t(
            "preview.overlay.description",
            "Preview read-only side drawer and warning confirmation patterns for settings actions."
          )}
        >
          <OverlayPreviewDemo />
        </Card>

        <Card
          title={t("preview.settingsWorkspace.title", "Guided Settings Workspace")}
          description={t(
            "preview.settingsWorkspace.description",
            "Preview the premium table-first settings workspace with filters, feedback, and drawer-based editing."
          )}
        >
          <GuidedSettingsWorkspacePreview />
        </Card>

        <Card
          title={t("preview.adminShell.title", "Admin Shell Layout")}
          description={t(
            "preview.adminShell.description",
            "Reusable sidebar + topbar shell used across all admin routes."
          )}
        >
          <div className="admin-shell-preview">
            <AdminSessionProvider>
              <AdminShell copy={copy.map}>
                <main className="admin-dashboard-page">
                  <SectionHeader
                    title={t("preview.adminShell.slotTitle", "Shell Content Slot")}
                    description={t(
                      "preview.adminShell.slotDescription",
                      "Child pages render into this content region."
                    )}
                  />
                </main>
              </AdminShell>
            </AdminSessionProvider>
          </div>
        </Card>

        <Card
          title={t("preview.configCard.title", "Config Document Card")}
          description={t(
            "preview.configCard.description",
            "Preview card used for content/options/legal documents in management lists."
          )}
        >
          <ConfigDocumentCard
            namespace="content"
            keyName="lesson.onboarding.intro"
            title={t("preview.configCard.sampleTitle", "Onboarding Intro Copy")}
            state="draft"
            versionLabel="v12 (draft)"
            updatedAtLabel="2026-05-10 14:03 UTC"
            updatedByLabel="Aisha Yusuf"
          />
        </Card>

        <OptionSetEditor
          title={t("preview.optionSetEditor.title", "Option Set Editor")}
          description={t(
            "preview.optionSetEditor.description",
            "Manage mutable option sets with reorder and enable/disable controls."
          )}
          items={languageOptions}
        />

        <PublishWorkflowPanel
          draftVersionLabel="v12"
          publishedVersionLabel="v11"
          lastPublishedBy="Miriam Okafor"
          lastPublishedAt="2026-05-10 13:42 UTC"
          hasChanges
        />
      </div>
    </main>
  );
}
