import { describe, expect, test } from "vitest";
import {
  formatChartDate,
  formatCompactDateTime,
  formatDate,
  formatDateTime,
} from "./dateFormatting";

const TIMESTAMP = "2026-06-01T02:03:04.000Z";

describe("date formatting", () => {
  test("uses the viewer locale and timezone for timestamps", () => {
    const date = new Date(TIMESTAMP);

    expect(formatDate(TIMESTAMP)).toBe(
      new Intl.DateTimeFormat(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
      }).format(date),
    );
    expect(formatDateTime(TIMESTAMP)).toBe(
      new Intl.DateTimeFormat(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
        second: "2-digit",
        timeZoneName: "short",
      }).format(date),
    );
    expect(formatCompactDateTime(TIMESTAMP)).toBe(
      new Intl.DateTimeFormat(undefined, {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      }).format(date),
    );
    expect(formatChartDate(TIMESTAMP)).toBe(
      new Intl.DateTimeFormat(undefined, { month: "numeric", day: "numeric" }).format(date),
    );
  });

  test("treats a date-only value as a calendar date", () => {
    expect(formatDate("2026-06-01")).toBe(
      new Intl.DateTimeFormat(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
        timeZone: "UTC",
      }).format(new Date("2026-06-01T00:00:00.000Z")),
    );
  });

  test("uses an em dash for missing or invalid values", () => {
    expect(formatDate("")).toBe("—");
    expect(formatDateTime("not-a-date")).toBe("—");
  });
});
