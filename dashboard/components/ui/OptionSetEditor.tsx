"use client";

import { Badge } from "./Badge";
import { Button } from "./Button";
import { Card } from "./Card";

export type OptionSetItem = {
  id: string;
  value: string;
  label: string;
  enabled: boolean;
  sortOrder: number;
};

export type OptionSetEditorProps = {
  title: string;
  description: string;
  items: OptionSetItem[];
  labels?: {
    addOption: string;
    enabled: string;
    disabled: string;
    order: string;
    moveUp: string;
    moveDown: string;
    disable: string;
    enable: string;
  };
  onAddOption?: () => void;
  onReorder?: (id: string, direction: "up" | "down") => void;
  onToggleEnabled?: (id: string) => void;
};

export function OptionSetEditor({
  title,
  description,
  items,
  labels,
  onAddOption,
  onReorder,
  onToggleEnabled
}: OptionSetEditorProps) {
  const ui = labels ?? {
    addOption: "Add Option",
    enabled: "Enabled",
    disabled: "Disabled",
    order: "Order",
    moveUp: "Move Up",
    moveDown: "Move Down",
    disable: "Disable",
    enable: "Enable"
  };

  return (
    <Card title={title} description={description}>
      <div className="option-set-editor">
        <div className="option-set-editor__actions">
          <Button size="sm" onClick={onAddOption}>
            {ui.addOption}
          </Button>
        </div>

        <ul className="option-set-editor__list">
          {items.map((item) => (
            <li key={item.id} className="option-set-editor__item">
              <div className="option-set-editor__row">
                <div className="option-set-editor__identity">
                  <p className="option-set-editor__label">{item.label}</p>
                  <p className="option-set-editor__value">{item.value}</p>
                </div>
                <Badge variant={item.enabled ? "success" : "neutral"}>
                  {item.enabled ? ui.enabled : ui.disabled}
                </Badge>
              </div>
              <div className="option-set-editor__controls">
                <span className="option-set-editor__order">
                  {ui.order} {item.sortOrder}
                </span>
                <Button size="sm" variant="ghost" onClick={() => onReorder?.(item.id, "up")}>
                  {ui.moveUp}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => onReorder?.(item.id, "down")}>
                  {ui.moveDown}
                </Button>
                <Button size="sm" variant="secondary" onClick={() => onToggleEnabled?.(item.id)}>
                  {item.enabled ? ui.disable : ui.enable}
                </Button>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </Card>
  );
}
