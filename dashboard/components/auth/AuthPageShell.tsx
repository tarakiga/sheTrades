import type { ReactNode } from "react";

export type AuthPageHighlight = {
  label: string;
  value: string;
};

export type AuthPageShellProps = {
  eyebrow: string;
  title: string;
  description: string;
  heroBadge?: ReactNode;
  heroHighlights?: ReactNode;
  asideLabel?: string;
  asideTitle: string;
  asideDescription: string;
  asidePoints: string[];
  asideHighlights?: AuthPageHighlight[];
  supportTitle?: string;
  supportDescription?: string;
  supportAction?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
};

export function AuthPageShell({
  eyebrow,
  title,
  description,
  heroBadge,
  heroHighlights,
  asideLabel = "Secure admin access",
  asideTitle,
  asideDescription,
  asidePoints,
  asideHighlights,
  supportTitle,
  supportDescription,
  supportAction,
  footer,
  children
}: AuthPageShellProps) {
  return (
    <section className="auth-shell">
      <div className="auth-shell__panel">
        <div className="auth-shell__hero">
          {heroBadge ? <div className="auth-shell__hero-badge">{heroBadge}</div> : null}
          <p className="auth-shell__eyebrow">{eyebrow}</p>
          <h1 className="auth-shell__title">{title}</h1>
          <p className="auth-shell__description">{description}</p>
          {heroHighlights ? <div className="auth-shell__hero-highlights">{heroHighlights}</div> : null}
        </div>

        <div className="auth-shell__card">{children}</div>

        {supportTitle || supportDescription || supportAction ? (
          <div className="auth-shell__support">
            <div className="auth-shell__support-copy">
              {supportTitle ? <p className="auth-shell__support-title">{supportTitle}</p> : null}
              {supportDescription ? (
                <p className="auth-shell__support-description">{supportDescription}</p>
              ) : null}
            </div>
            {supportAction ? <div className="auth-shell__support-action">{supportAction}</div> : null}
          </div>
        ) : null}

        {footer ? <div className="auth-shell__footer">{footer}</div> : null}
      </div>

      <aside className="auth-shell__aside" aria-label={asideTitle}>
        <div className="auth-shell__aside-panel">
          <div className="auth-shell__aside-copy">
            <p className="auth-shell__aside-label">{asideLabel}</p>
            <h2 className="auth-shell__aside-title">{asideTitle}</h2>
            <p className="auth-shell__aside-description">{asideDescription}</p>
          </div>
          {asideHighlights && asideHighlights.length > 0 ? (
            <div className="auth-shell__aside-highlights" aria-label={`${asideTitle} highlights`}>
              {asideHighlights.map((highlight) => (
                <div
                  key={`${highlight.label}-${highlight.value}`}
                  className="auth-shell__aside-highlight"
                >
                  <strong className="auth-shell__aside-highlight-value">{highlight.value}</strong>
                  <span className="auth-shell__aside-highlight-label">{highlight.label}</span>
                </div>
              ))}
            </div>
          ) : null}
          <ul className="auth-shell__aside-points">
            {asidePoints.map((point) => (
              <li key={point} className="auth-shell__aside-point">
                {point}
              </li>
            ))}
          </ul>
        </div>
      </aside>
    </section>
  );
}
