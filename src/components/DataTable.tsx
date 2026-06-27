import { useMemo, useState, type ReactNode } from "react";

export interface Column<T> {
  key: string;
  header: string;
  numeric?: boolean;
  /** Accessor for sorting/CSV; defaults to row[key]. */
  value?: (row: T) => string | number | null;
  /** Custom cell render; defaults to the value. */
  render?: (row: T) => ReactNode;
}

type Dir = "asc" | "desc";

function defaultValue<T>(row: T, key: string): string | number | null {
  const v = (row as Record<string, unknown>)[key];
  if (v == null) return null;
  if (typeof v === "number" || typeof v === "string") return v;
  if (typeof v === "boolean") return v ? 1 : 0;
  return String(v);
}

/**
 * Generic sortable table. Click a header to sort (toggles asc/desc). Numeric
 * columns sort numerically with null/unknown values sinking to the bottom.
 */
export function DataTable<T>({ columns, rows }: { columns: Column<T>[]; rows: T[] }) {
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [dir, setDir] = useState<Dir>("desc");

  const sorted = useMemo(() => {
    if (!sortKey) return rows;
    const col = columns.find((c) => c.key === sortKey);
    if (!col) return rows;
    const getv = (r: T) => (col.value ? col.value(r) : defaultValue(r, col.key));
    const factor = dir === "asc" ? 1 : -1;
    return [...rows].sort((a, b) => {
      const av = getv(a);
      const bv = getv(b);
      // nulls always sink to the bottom regardless of direction
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      if (typeof av === "number" && typeof bv === "number") {
        return (av - bv) * factor;
      }
      return String(av).localeCompare(String(bv)) * factor;
    });
  }, [rows, columns, sortKey, dir]);

  const onSort = (key: string) => {
    if (sortKey === key) {
      setDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setDir("desc");
    }
  };

  return (
    <div className="table-scroll">
      <table className="data">
        <thead>
          <tr>
            {columns.map((c) => (
              <th
                key={c.key}
                className={c.numeric ? "num" : undefined}
                onClick={() => onSort(c.key)}
                title="Sort"
              >
                {c.header}
                {sortKey === c.key && <span className="arrow">{dir === "asc" ? "↑" : "↓"}</span>}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((row, i) => (
            <tr key={i}>
              {columns.map((c) => (
                <td key={c.key} className={c.numeric ? "num" : undefined}>
                  {c.render
                    ? c.render(row)
                    : formatCell(c.value ? c.value(row) : defaultValue(row, c.key))}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function formatCell(v: string | number | null): ReactNode {
  if (v == null) return <span className="muted">—</span>;
  if (typeof v === "number") return v.toLocaleString();
  return v;
}
