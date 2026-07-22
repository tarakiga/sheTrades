import type { ReactNode } from "react";

export type ConstraintMeterState = "ok" | "warn" | "over";

export type ConstraintMeterProps = {
  /** Characters used (already includes any bot-added chars, if applicable). */
  used: number;
  /** Hard limit for this field. */
  limit: number;
  /**
   * Size of the "breathing room" warning band just below the limit. Defaults to
   * ~10% of the limit (min 3). Inside this band the meter turns yellow.
   */
  breathingRoom?: number;
  /** Optional label shown on the left. */
  label?: ReactNode;
  /** How many of `used` are system/bot chars the admin did not type. */
  systemChars?: number;
  /** Small helper note shown when not over-limit (e.g. usage guidance). */
  hint?: ReactNode;
  /** Unit word for the readout (default "chars"). */
  unit?: string;
  /** What WhatsApp does when over: truncate the text, or reject the message. */
  overflow?: "truncate" | "reject";
  className?: string;
};

function resolveState(used: number, limit: number, breathingRoom: number): ConstraintMeterState {
  if (used > limit) return "over";
  if (used > limit - breathingRoom) return "warn";
  return "ok";
}

/**
 * Live character-budget meter with green / yellow / red feedback.
 *
 * - green  = comfortably under the limit ("standard")
 * - yellow = within the breathing-room band just below the limit
 * - red    = over the limit (will be truncated or rejected by WhatsApp)
 *
 * Colors come from the design-system semantic tokens (success/warning/danger),
 * so the meter reads correctly in light and dark themes. Pass `used` already
 * inclusive of bot-added characters (see lib/whatsapp-constraints.ts) and
 * optionally `systemChars` to disclose how much of the budget the bot consumes.
 */
export function ConstraintMeter({
  used,
  limit,
  breathingRoom,
  label,
  systemChars,
  hint,
  unit = "chars",
  overflow = "reject",
  className
}: ConstraintMeterProps) {
  const room = breathingRoom ?? Math.max(3, Math.round(limit * 0.1));
  const state = resolveState(used, limit, room);
  const pct = limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 0;
  const over = used - limit;

  return (
    <div
      className={`constraint-meter constraint-meter--${state}${className ? ` ${className}` : ""}`}
      role="meter"
      aria-valuenow={used}
      aria-valuemin={0}
      aria-valuemax={limit}
      aria-label={typeof label === "string" ? `${label}: ${used} of ${limit} ${unit}` : undefined}
    >
      <div className="constraint-meter__head">
        {label ? <span className="constraint-meter__label">{label}</span> : <span />}
        <span className="constraint-meter__count">
          {used}
          <span className="constraint-meter__count-sep"> / </span>
          {limit}
          <span className="constraint-meter__count-unit"> {unit}</span>
        </span>
      </div>
      <div className="constraint-meter__track">
        <div className="constraint-meter__fill" style={{ width: `${pct}%` }} />
      </div>
      <div className="constraint-meter__foot">
        {state === "over" ? (
          <span className="constraint-meter__msg constraint-meter__msg--over">
            Over limit by {over} {unit} - will be {overflow === "truncate" ? "cut off" : "rejected"}
          </span>
        ) : typeof systemChars === "number" && systemChars > 0 ? (
          <span className="constraint-meter__msg">
            includes +{systemChars} auto-added by the bot
          </span>
        ) : hint ? (
          <span className="constraint-meter__msg">{hint}</span>
        ) : (
          <span />
        )}
      </div>
    </div>
  );
}
