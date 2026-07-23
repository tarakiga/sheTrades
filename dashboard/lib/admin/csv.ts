/**
 * Client-side CSV building + download, for exports whose data the page has
 * already loaded (e.g. the Overview summary). Server-backed exports go through
 * downloadAdminCsv in api.ts instead - this module never touches the network.
 */

function escapeCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  const s = String(value).replace(/"/g, '""');
  return /[",\n]/.test(s) ? `"${s}"` : s;
}

export function buildCsv(header: string[], rows: Array<Array<unknown>>): string {
  const lines = [header, ...rows].map((row) => row.map(escapeCell).join(","));
  return lines.join("\n");
}

export function downloadCsvText(filename: string, csv: string): void {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
