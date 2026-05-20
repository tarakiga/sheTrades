import type { ReactNode } from "react";

export type TableColumn<T> = {
  key: keyof T;
  header: string;
  render?: (value: T[keyof T], row: T) => ReactNode;
};

export type TableProps<T extends Record<string, unknown>> = {
  columns: Array<TableColumn<T>>;
  rows: Array<T>;
  emptyMessage?: string;
  emptyState?: ReactNode;
  wrapperClassName?: string;
  tableClassName?: string;
  rowClassName?: (row: T) => string;
};

export function Table<T extends Record<string, unknown>>({
  columns,
  rows,
  emptyMessage = "No data available.",
  emptyState,
  wrapperClassName,
  tableClassName,
  rowClassName
}: TableProps<T>) {
  if (!rows.length) {
    if (emptyState) return emptyState;
    return <p className="ui-table__empty">{emptyMessage}</p>;
  }

  return (
    <div className={["ui-table-wrap", wrapperClassName ?? ""].filter(Boolean).join(" ")}>
      <table className={["ui-table", tableClassName ?? ""].filter(Boolean).join(" ")}>
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={String(column.key)}>{column.header}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, rowIndex) => (
            <tr key={`row-${rowIndex}`} className={rowClassName ? rowClassName(row) : undefined}>
              {columns.map((column) => {
                const rawValue = row[column.key];
                return (
                  <td key={`${String(column.key)}-${rowIndex}`}>
                    {column.render ? column.render(rawValue, row) : String(rawValue)}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
