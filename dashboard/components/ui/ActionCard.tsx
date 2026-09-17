import type { ReactElement, ReactNode } from "react";
import { Badge, type BadgeProps } from "./Badge";
import { Card } from "./Card";

export type ActionCardProps = {
  title: string;
  description: string;
  /** Who or what this is for, shown beside the title. */
  badge?: { label: string; variant?: BadgeProps["variant"] };
  /** A caution or caveat under the description, e.g. "Contains personal data". */
  note?: string;
  /** The one thing this card does: a Button, rendered by the caller so it owns its handler and loading state. */
  action: ReactNode;
};

/**
 * A card that exists to be acted on: a title, a line of description, an
 * optional badge and note, and exactly one action. Used wherever a set of
 * choices each carry their own button - report presets, for one - so the
 * choices lay out in a wrapping grid instead of a strip that scrolls.
 *
 * The badge shares the header row with the title only; the description sits
 * in the body at full width, and the action is pinned to the bottom so a
 * row of these cards lines its buttons up whatever their descriptions say.
 */
export function ActionCard({ title, description, badge, note, action }: ActionCardProps): ReactElement {
  return (
    <Card
      title={title}
      {...(badge ? { actions: <Badge variant={badge.variant ?? "neutral"}>{badge.label}</Badge> } : {})}
    >
      <div className="ui-action-card__body">
        <p className="ui-action-card__description">{description}</p>
        {note ? <p className="ui-action-card__note">{note}</p> : null}
        <div className="ui-action-card__action">{action}</div>
      </div>
    </Card>
  );
}
