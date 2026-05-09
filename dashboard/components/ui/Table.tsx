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
};

export function Table<T extends Record<string, unknown>>({
  columns,
  rows,
  emptyMessage = "No data available."
}: TableProps<T>) {
  if (!rows.length) {
    return <p className="ui-table__empty">{emptyMessage}</p>;
  }

  return (
    <div className="ui-table-wrap">
      <table className="ui-table">
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={String(column.key)}>{column.header}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, rowIndex) => (
            <tr key={`row-${rowIndex}`}>
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
