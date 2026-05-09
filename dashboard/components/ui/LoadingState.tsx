export type LoadingStateProps = {
  label?: string;
};

export function LoadingState({ label = "Loading content..." }: LoadingStateProps) {
  return (
    <div className="ui-loading-state" role="status" aria-live="polite">
      <span className="ui-loading-state__spinner" aria-hidden="true" />
      <span>{label}</span>
    </div>
  );
}
