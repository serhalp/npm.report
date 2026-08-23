type DateValue = string | number | Date | null | undefined;

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

const DATE_OPTIONS: Intl.DateTimeFormatOptions = {
  year: "numeric",
  month: "short",
  day: "numeric",
};

const dateFormatter = new Intl.DateTimeFormat(undefined, DATE_OPTIONS);
const calendarDateFormatter = new Intl.DateTimeFormat(undefined, {
  ...DATE_OPTIONS,
  timeZone: "UTC",
});
const dateTimeFormatter = new Intl.DateTimeFormat(undefined, {
  ...DATE_OPTIONS,
  hour: "numeric",
  minute: "2-digit",
  second: "2-digit",
  timeZoneName: "short",
});
const compactDateTimeFormatter = new Intl.DateTimeFormat(undefined, {
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
});
const chartDateFormatter = new Intl.DateTimeFormat(undefined, {
  month: "numeric",
  day: "numeric",
});

function asDate(value: DateValue): Date | null {
  if (value === null || value === undefined || value === "") return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function formatDate(value: DateValue): string {
  const date = asDate(value);
  if (!date) return "—";
  return typeof value === "string" && DATE_ONLY.test(value)
    ? calendarDateFormatter.format(date)
    : dateFormatter.format(date);
}

export function formatDateTime(value: DateValue): string {
  const date = asDate(value);
  return date ? dateTimeFormatter.format(date) : "—";
}

export function formatCompactDateTime(value: DateValue): string {
  const date = asDate(value);
  return date ? compactDateTimeFormatter.format(date) : "—";
}

export function formatChartDate(value: DateValue): string {
  const date = asDate(value);
  return date ? chartDateFormatter.format(date) : "—";
}
