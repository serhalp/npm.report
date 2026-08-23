// Export helpers: copy-to-clipboard JSON and download CSV. Generic over the
// table data so every report reuses them.

const CSV_QUOTE_RE = /[",\n\r]/;

export async function copyJson(data: unknown): Promise<void> {
  const text = JSON.stringify(data, null, 2);
  await navigator.clipboard.writeText(text);
}

function csvCell(value: unknown): string {
  if (value == null) return "";
  let s: string;
  if (typeof value === "string") s = value;
  else if (typeof value === "number" || typeof value === "boolean" || typeof value === "bigint")
    s = value.toString();
  else if (value instanceof Date) s = value.toISOString();
  else if (typeof value === "object") {
    const json = JSON.stringify(value);
    if (json === undefined) throw new TypeError("CSV cell is not serializable");
    s = json;
  } else throw new TypeError(`Unsupported CSV cell type: ${typeof value}`);
  // Quote if it contains a comma, quote, newline, or leading/trailing space.
  if (CSV_QUOTE_RE.test(s) || s !== s.trim()) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export function toCsv<T extends Record<string, unknown>>(
  rows: T[],
  columns: { key: keyof T; header: string }[],
): string {
  const head = columns.map((c) => csvCell(c.header)).join(",");
  const body = rows.map((row) => columns.map((c) => csvCell(row[c.key])).join(","));
  return [head, ...body].join("\r\n");
}

export function downloadCsv(filename: string, csv: string): void {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
