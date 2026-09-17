import { createHash } from "node:crypto";

/**
 * The per-learner reports: one row per learner with the moments that matter -
 * when she enrolled, when each module and the whole course were finished,
 * how long it took - in West Africa Time.
 *
 * Two variants share one row builder:
 * - "Learner journey", for donors: pseudonymous reference, no name, no phone.
 * - "M&E participant report", internal: name and phone, plus a status per
 *   module and for the course. It contains personal data; it is for the
 *   team, never for a file that leaves the organisation.
 *
 * Everything here is pure so the arithmetic and the formatting are tested
 * without a database; the export service's only job is the query.
 */

/** UTC+1, no daylight saving. Nigeria has used it since 1919. */
export const WAT_OFFSET_MS = 60 * 60 * 1000;

function toDate(value: Date | string | null | undefined): Date | null {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** "YYYY-MM-DD HH:mm" in West Africa Time, or "" when there is no date. */
export function formatWat(value: Date | string | null | undefined): string {
  const d = toDate(value);
  if (!d) return "";
  const iso = new Date(d.getTime() + WAT_OFFSET_MS).toISOString();
  return `${iso.slice(0, 10)} ${iso.slice(11, 16)}`;
}

/** "YYYY-MM" in West Africa Time: the reporting month a moment belongs to. */
export function watMonth(value: Date | string | null | undefined): string {
  const d = toDate(value);
  if (!d) return "";
  return new Date(d.getTime() + WAT_OFFSET_MS).toISOString().slice(0, 7);
}

/**
 * A stable pseudonymous reference for a learner: the same learner gets the
 * same ref in every report, and nothing about her can be recovered from it.
 * Donor-facing files carry this instead of a phone number.
 */
export function learnerRef(userId: string): string {
  return `L-${createHash("sha256").update(`learner-ref:${userId}`).digest("hex").slice(0, 10).toUpperCase()}`;
}

/** Days from start to end, one decimal; null when either is missing or end precedes start. */
export function daysBetween(start: Date | string | null | undefined, end: Date | string | null | undefined): number | null {
  const a = toDate(start);
  const b = toDate(end);
  if (!a || !b) return null;
  const days = (b.getTime() - a.getTime()) / 86_400_000;
  if (days < 0) return null;
  return Math.round(days * 10) / 10;
}

export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((x, y) => x - y);
  const mid = Math.floor(sorted.length / 2);
  const m = sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
  return Math.round(m * 10) / 10;
}

function moduleNumber(key: string): number | null {
  const digits = key.match(/\d+/);
  return digits ? Number(digits[0]) : null;
}

/**
 * The column stem for a module as stored in user_progress. Keys arrive as
 * "module1", "Module 1" or a titled "Module 3: Selling online"; all of those
 * become "module3"-style stems so the header is predictable.
 */
export function moduleStem(key: string): string {
  const n = moduleNumber(key);
  if (n !== null) return `module${n}`;
  const slug = key.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  return slug || "module";
}

/** Unique module keys in curriculum order: by number where there is one, then by name. */
export function sortModuleKeys(keys: Iterable<string>): string[] {
  const unique = [...new Set(keys)];
  const rank = (k: string) => moduleNumber(k) ?? Number.POSITIVE_INFINITY;
  return unique.sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));
}

/**
 * The registry lists the per-module columns once, with "{n}" where the module
 * number goes; a report expands them for the modules actually present, as a
 * group per module, at the position of the first placeholder.
 */
export const MODULE_PLACEHOLDER = "module{n}";

export function expandJourneyColumns(columns: string[], moduleKeys: string[]): string[] {
  const placeholders = columns.filter((c) => c.startsWith(MODULE_PLACEHOLDER));
  if (placeholders.length === 0) return [...columns];
  const at = columns.findIndex((c) => c.startsWith(MODULE_PLACEHOLDER));
  const rest = columns.filter((c) => !c.startsWith(MODULE_PLACEHOLDER));
  const expanded = moduleKeys.flatMap((key) => placeholders.map((p) => p.replace(MODULE_PLACEHOLDER, moduleStem(key))));
  return [...rest.slice(0, at), ...expanded, ...rest.slice(at)];
}

export type ModuleProgress = {
  module: string;
  startedAt: Date | string | null;
  completedAt: Date | string | null;
  /** completionPercentage as stored; lets "in progress" be told from "not started". */
  pct?: number | null;
};

export type JourneyInput = {
  id: string;
  name?: string | null;
  phone?: string | null;
  location: string | null;
  language: string | null;
  firstContactAt: Date | string | null;
  enrolledAt: Date | string | null;
  lastActiveAt: Date | string | null;
  certificateId: string | null;
  courseCompletedAt: Date | string | null;
  rewardsIssuedNgn: number | string | null;
  modules: ModuleProgress[];
};

export type ModuleStatus = "Not started" | "In progress" | "Completed";
export type CourseStatus = "Registered" | "Enrolled" | "In progress" | "Completed";

function touched(m: ModuleProgress): boolean {
  return toDate(m.startedAt) !== null || (m.pct ?? 0) > 0;
}

export function moduleStatus(m: ModuleProgress | undefined): ModuleStatus {
  if (!m) return "Not started";
  if (toDate(m.completedAt) !== null || (m.pct ?? 0) >= 100) return "Completed";
  return touched(m) ? "In progress" : "Not started";
}

/** Where she is in the funnel: first contact only, consented, working, or holding a certificate. */
export function courseStatus(input: JourneyInput): CourseStatus {
  if (toDate(input.courseCompletedAt) !== null) return "Completed";
  if (input.modules.some((m) => moduleStatus(m) !== "Not started")) return "In progress";
  if (toDate(input.enrolledAt) !== null) return "Enrolled";
  return "Registered";
}

/** Donor-facing. The two "{n}" entries expand per module. Published as learner_journey v1; unchanged. */
export const JOURNEY_COLUMNS = [
  "learnerRef",
  "state",
  "language",
  "firstContactAtWAT",
  "enrolledAtWAT",
  "module{n}StartedAtWAT",
  "module{n}CompletedAtWAT",
  "modulesCompleted",
  "courseCompletedAtWAT",
  "daysToComplete",
  "lastActiveAtWAT",
  "certificateId",
  "rewardsIssuedNgn"
];

/** Internal M&E. Name and phone, a status per module, a course status. */
export const ME_PARTICIPANT_COLUMNS = [
  "learnerRef",
  "name",
  "phone",
  "state",
  "language",
  "firstContactAtWAT",
  "enrolledAtWAT",
  "module{n}Status",
  "module{n}StartedAtWAT",
  "module{n}CompletedAtWAT",
  "modulesCompleted",
  "courseStatus",
  "courseCompletedAtWAT",
  "daysToComplete",
  "lastActiveAtWAT",
  "certificateId",
  "rewardsIssuedNgn"
];

type RowVariant = "journey" | "participants";

function buildRow(input: JourneyInput, moduleKeys: string[], variant: RowVariant): string[] {
  const byStem = new Map(input.modules.map((m) => [moduleStem(m.module), m]));
  const perModule = moduleKeys.flatMap((key) => {
    const m = byStem.get(moduleStem(key));
    const times = [formatWat(m?.startedAt), formatWat(m?.completedAt)];
    return variant === "participants" ? [moduleStatus(m), ...times] : times;
  });
  const modulesCompleted = input.modules.filter((m) => moduleStatus(m) === "Completed").length;
  const days = daysBetween(input.enrolledAt, input.courseCompletedAt);
  const ngn = Number(input.rewardsIssuedNgn ?? 0);
  const identity = variant === "participants" ? [learnerRef(input.id), input.name ?? "", input.phone ?? ""] : [learnerRef(input.id)];
  return [
    ...identity,
    input.location ?? "",
    input.language ?? "",
    formatWat(input.firstContactAt),
    formatWat(input.enrolledAt),
    ...perModule,
    String(modulesCompleted),
    ...(variant === "participants" ? [courseStatus(input)] : []),
    formatWat(input.courseCompletedAt),
    days === null ? "" : days.toFixed(1),
    formatWat(input.lastActiveAt),
    input.certificateId ?? "",
    String(Number.isFinite(ngn) ? Math.round(ngn) : 0)
  ];
}

/** One donor-report row, aligned with expandJourneyColumns(JOURNEY_COLUMNS, moduleKeys). */
export function journeyRow(input: JourneyInput, moduleKeys: string[]): string[] {
  return buildRow(input, moduleKeys, "journey");
}

/** One M&E row, aligned with expandJourneyColumns(ME_PARTICIPANT_COLUMNS, moduleKeys). */
export function participantRow(input: JourneyInput, moduleKeys: string[]): string[] {
  return buildRow(input, moduleKeys, "participants");
}
