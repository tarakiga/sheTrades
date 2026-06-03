import type { ReactElement } from "react";

export type IssuanceSuccessGaugeProps = {
  issued: number;
  pending: number;
  failed: number;
};

const SIZE = 90;
const STROKE_WIDTH = 12;
const RADIUS = (SIZE - STROKE_WIDTH) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

type ArcSegment = {
  key: "issued" | "pending" | "failed";
  modifier: string;
  length: number;
  offset: number;
};

function safeNumber(value: number): number {
  if (!Number.isFinite(value) || value < 0) return 0;
  return value;
}

function formatPercent(part: number, total: number): string {
  if (total <= 0) return "0.0%";
  const ratio = (part / total) * 100;
  return `${ratio.toFixed(1)}%`;
}

function buildSegments(
  issued: number,
  pending: number,
  failed: number
): Array<ArcSegment> {
  const total = issued + pending + failed;
  if (total <= 0) return [];

  const parts: Array<{ key: ArcSegment["key"]; modifier: string; value: number }> = [
    { key: "issued", modifier: "issuance-success-gauge__arc--issued", value: issued },
    { key: "pending", modifier: "issuance-success-gauge__arc--pending", value: pending },
    { key: "failed", modifier: "issuance-success-gauge__arc--failed", value: failed }
  ];

  let runningOffset = 0;
  const segments: Array<ArcSegment> = [];
  for (const part of parts) {
    if (part.value <= 0) continue;
    const length = (part.value / total) * CIRCUMFERENCE;
    segments.push({
      key: part.key,
      modifier: part.modifier,
      length,
      offset: runningOffset
    });
    runningOffset += length;
  }
  return segments;
}

export function IssuanceSuccessGauge(
  props: IssuanceSuccessGaugeProps
): ReactElement {
  const issued = safeNumber(props.issued);
  const pending = safeNumber(props.pending);
  const failed = safeNumber(props.failed);
  const total = issued + pending + failed;
  const percent = formatPercent(issued, total);
  const segments = buildSegments(issued, pending, failed);
  const center = SIZE / 2;

  return (
    <div className="issuance-success-gauge">
      <div className="issuance-success-gauge__chart">
        <svg
          aria-hidden="true"
          className="issuance-success-gauge__svg"
          viewBox={`0 0 ${SIZE} ${SIZE}`}
          role="img"
        >
          <circle
            className="issuance-success-gauge__track"
            cx={center}
            cy={center}
            r={RADIUS}
          />
          {segments.map((segment) => (
            <circle
              key={segment.key}
              className={`issuance-success-gauge__arc ${segment.modifier}`}
              cx={center}
              cy={center}
              r={RADIUS}
              strokeDasharray={`${segment.length} ${CIRCUMFERENCE - segment.length}`}
              strokeDashoffset={-segment.offset}
            />
          ))}
        </svg>
        <div
          aria-live="polite"
          className="issuance-success-gauge__center"
          role="status"
        >
          <span className="issuance-success-gauge__percent">{percent}</span>
        </div>
      </div>

      <ul className="issuance-success-gauge__legend">
        <li className="issuance-success-gauge__legend-row">
          <span
            aria-hidden="true"
            className="issuance-success-gauge__legend-swatch issuance-success-gauge__legend-swatch--issued"
          />
          <span className="issuance-success-gauge__legend-value">{issued}</span>
          <span>Issued</span>
        </li>
        <li className="issuance-success-gauge__legend-row">
          <span
            aria-hidden="true"
            className="issuance-success-gauge__legend-swatch issuance-success-gauge__legend-swatch--pending"
          />
          <span className="issuance-success-gauge__legend-value">{pending}</span>
          <span>Pending</span>
        </li>
        <li className="issuance-success-gauge__legend-row">
          <span
            aria-hidden="true"
            className="issuance-success-gauge__legend-swatch issuance-success-gauge__legend-swatch--failed"
          />
          <span className="issuance-success-gauge__legend-value">{failed}</span>
          <span>Failed</span>
        </li>
      </ul>
    </div>
  );
}
