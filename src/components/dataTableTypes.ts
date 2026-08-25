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
      dateTime?: string;
      title?: string;
    };

export interface Column<T> {
  key: string;
  header: string;
  numeric?: boolean;
  value?: (row: T) => SortValue;
  cell?: (row: T) => CellValue;
  /** Full row comparator; takes precedence over value/default string sorting. */
  compare?: (a: T, b: T) => number;
}
