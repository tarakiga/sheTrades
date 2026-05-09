import type { ReactNode } from "react";

export type CardProps = {
  title?: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
};

export function Card({ title, description, actions, children }: CardProps) {
  return (
    <section className="ui-card">
      {title || description || actions ? (
        <header className="ui-card__header">
          <div>
            {title ? <h3 className="ui-card__title">{title}</h3> : null}
            {description ? <p className="ui-card__description">{description}</p> : null}
          </div>
          {actions ? <div>{actions}</div> : null}
        </header>
      ) : null}
      <div className="ui-card__content">{children}</div>
    </section>
  );
}
