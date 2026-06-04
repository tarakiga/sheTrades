import Link from "next/link";
import { redirect } from "next/navigation";
import { Badge, Card, SectionHeader } from "../../../components/ui";
import { ConfigAdminManager } from "../../../components/config/ConfigAdminManager";
import { IntegrationSettingsWorkspace } from "../../../components/integration/IntegrationSettingsWorkspace";
import { RewardRulesWorkspace } from "../../../components/integration/RewardRulesWorkspace";
import { getPublicConfigNamespace } from "../../../lib/config/api";
import { getAdminUiCopy } from "../../../lib/config/admin-ui-copy";

type SettingsTabId = "options" | "legal" | "integration" | "rewards";

type SettingsPageProps = {
  searchParams?: Promise<{
    tab?: string;
  }>;
};

type TabConfig = {
  id: SettingsTabId;
  namespace?: "options" | "legal";
  defaultType?: "option_set" | "legal_block";
  titleKey: string;
  titleFallback: string;
  hintKey: string;
  hintFallback: string;
};

const TABS_BY_ID: Record<SettingsTabId, TabConfig> = {
  options: {
    id: "options",
    namespace: "options",
    defaultType: "option_set",
    titleKey: "settings.tab.options",
    titleFallback: "Options",
    hintKey: "settings.tab.options.hint",
    hintFallback: "Dropdowns and selectors"
  },
  legal: {
    id: "legal",
    namespace: "legal",
    defaultType: "legal_block",
    titleKey: "settings.tab.legal",
    titleFallback: "Legal",
    hintKey: "settings.tab.legal.hint",
    hintFallback: "Consent and policy text"
  },
  integration: {
    id: "integration",
    titleKey: "settings.tab.integration",
    titleFallback: "Integration",
    hintKey: "settings.tab.integration.hint",
    hintFallback: "WhatsApp, email, and access"
  },
  rewards: {
    id: "rewards",
    titleKey: "settings.tab.rewards",
    titleFallback: "Rewards",
    hintKey: "settings.tab.rewards.hint",
    hintFallback: "Reward amount and delivery"
  }
};

const TABS: Array<TabConfig> = [TABS_BY_ID.options, TABS_BY_ID.legal, TABS_BY_ID.integration, TABS_BY_ID.rewards];

function resolveActiveTab(raw: string | undefined): SettingsTabId {
  if (raw === "options" || raw === "legal" || raw === "integration" || raw === "rewards") {
    return raw;
  }
  return "options";
}

export default async function SettingsPage({ searchParams }: SettingsPageProps) {
  const copy = await getAdminUiCopy();
  const t = copy.t;
  const params = (await searchParams) ?? {};

  if (params.tab === "content") {
    redirect("/content");
  }

  const activeTabId = resolveActiveTab(params.tab);
  const activeTab = TABS_BY_ID[activeTabId];
  const configResult =
    activeTab.namespace !== undefined
      ? await getPublicConfigNamespace(activeTab.namespace)
      : { source: "live" as const, message: undefined };

  return (
    <main className="admin-dashboard-page">
      <SectionHeader
        title={t("settings.title", "Settings")}
        description={t(
          "settings.description",
          "Manage option lists and legal content in one clear workspace."
        )}
        actions={
          <Badge variant={configResult.source === "live" ? "success" : "warning"}>
            {configResult.source === "live"
              ? t("common.liveData", "Live Data")
              : t("common.fallbackData", "Fallback Data")}
          </Badge>
        }
      />

      <Card
        title={t("settings.tabs.title", "Configuration Areas")}
        description={t(
          "settings.tabs.description",
          "Choose a settings area to update option lists or legal content without leaving this workspace."
        )}
      >
        <div
          className="settings-tabs"
          role="tablist"
          aria-label={t("settings.tabs.aria", "Settings tabs")}
        >
          {TABS.map((tab) => {
            const active = tab.id === activeTabId;
            return (
              <Link
                key={tab.id}
                href={`/settings?tab=${tab.id}`}
                className={`settings-tabs__link ${active ? "settings-tabs__link--active" : ""}`}
                role="tab"
                aria-selected={active}
                suppressHydrationWarning
              >
                <span className="settings-tabs__title">{t(tab.titleKey, tab.titleFallback)}</span>
                <span className="settings-tabs__hint">{t(tab.hintKey, tab.hintFallback)}</span>
              </Link>
            );
          })}
        </div>
      </Card>

      {configResult.message ? <p className="admin-inline-note">{configResult.message}</p> : null}

      {activeTab.id === "integration" ? (
        <IntegrationSettingsWorkspace copy={copy.map} />
      ) : activeTab.id === "rewards" ? (
        <RewardRulesWorkspace />
      ) : activeTab.namespace && activeTab.defaultType ? (
        <ConfigAdminManager
          namespace={activeTab.namespace}
          defaultType={activeTab.defaultType}
          copy={copy.map}
          showAccessControls={false}
        />
      ) : null}
    </main>
  );
}
