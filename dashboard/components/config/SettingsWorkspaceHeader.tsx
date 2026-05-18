import { Badge } from "../ui";

type SettingsWorkspaceSummaryItem = {
  label: string;
  value: string;
};

export type SettingsWorkspaceHeaderProps = {
  title: string;
  description: string;
  summary: Array<SettingsWorkspaceSummaryItem>;
};

export function SettingsWorkspaceHeader({
  title,
  description,
  summary
}: SettingsWorkspaceHeaderProps) {
  return (
    <section className="settings-workspace-header">
      <div className="settings-workspace-header__copy">
        <h2 className="settings-workspace-header__title">{title}</h2>
        <p className="settings-workspace-header__description">{description}</p>
      </div>
      <div className="settings-workspace-header__summary">
        {summary.map((item) => (
          <div key={item.label} className="settings-workspace-header__summary-item">
            <span className="settings-workspace-header__summary-label">{item.label}</span>
            <Badge variant="neutral">{item.value}</Badge>
          </div>
        ))}
      </div>
    </section>
  );
}
