export type SortValue = string | number | null;

export type CellValue =
  | string
  | number
  | null
  | {
      text: string | number | null;
      className?: string;
      badgeClass?: string;
      flag?: boolean;
      muted?: boolean;
    };

export interface Column<T> {
  key: string;
  header: string;
  numeric?: boolean;
  value?: (row: T) => SortValue;
  cell?: (row: T) => CellValue;
}
