/** UTC+1, no daylight saving: West Africa Time, the time the reports themselves are written in. */
const WAT_OFFSET_MS = 60 * 60 * 1000;

/** "2026-09-17 19:12" in West Africa Time, or "" when the value is not a date. */
export function formatWat(value: string | number | Date | null | undefined): string {
  if (value === null || value === undefined || value === "") return "";
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  const iso = new Date(d.getTime() + WAT_OFFSET_MS).toISOString();
  return `${iso.slice(0, 10)} ${iso.slice(11, 16)}`;
}
