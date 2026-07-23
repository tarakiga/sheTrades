export type FunnelStage = {
  label: string;
  count: number;
};

export type FunnelBarsProps = {
  stages: FunnelStage[];
  ariaLabel?: string;
};

/**
 * Horizontal stage bars for a learner funnel. One measure (learners) across
 * ordered stages, so a single brand hue carries every bar - no legend needed.
 * Widths and the share caption are relative to the FIRST stage (top of funnel),
 * not the previous stage: stages here are not strictly monotonic (quiz attempts
 * can exceed completions), so stage-over-stage conversion would mislead.
 */
export function FunnelBars({ stages, ariaLabel = "Funnel breakdown" }: FunnelBarsProps) {
  if (stages.length === 0) return null;
  const base = stages[0]?.count ?? 0;
  const max = Math.max(...stages.map((stage) => stage.count), 1);

  return (
    <div className="ui-funnel" role="img" aria-label={ariaLabel}>
      {stages.map((stage, index) => {
        const widthPct = Math.max((stage.count / max) * 100, stage.count > 0 ? 2 : 0);
        const share = base > 0 ? Math.round((stage.count / base) * 100) : 0;
        const shareText = index === 0 ? "100%" : `${share}%`;
        return (
          <div
            key={`${stage.label}-${index}`}
            className="ui-funnel__row"
            title={`${stage.label}: ${stage.count.toLocaleString()} learners (${shareText} of ${stages[0]?.label.toLowerCase() ?? "top"})`}
          >
            <span className="ui-funnel__label">{stage.label}</span>
            <span className="ui-funnel__track">
              <span className="ui-funnel__bar" style={{ width: `${widthPct}%` }} />
            </span>
            <span className="ui-funnel__value">
              {stage.count.toLocaleString()}
              <span className="ui-funnel__share">{shareText}</span>
            </span>
          </div>
        );
      })}
    </div>
  );
}

/**
 * Parse the backend's funnel summary string ("Registered 43 -> Started 15 ->
 * ...") into stages. Returns null when the text does not match, so callers can
 * fall back to rendering the raw string (e.g. the "No published funnel" note).
 */
export function parseFunnelSummary(text: string): FunnelStage[] | null {
  const parts = text.split("->").map((part) => part.trim());
  if (parts.length < 2) return null;
  const stages: FunnelStage[] = [];
  for (const part of parts) {
    const match = part.match(/^(.*\S)\s+(\d+)$/);
    if (!match) return null;
    stages.push({ label: match[1] ?? "", count: Number(match[2]) });
  }
  return stages;
}
