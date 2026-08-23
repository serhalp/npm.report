import { describe, expect, it } from "vitest";
import type { ReportTrustHistoryPoint } from "#shared/reportHistory";
import { spacedTrendDateIndices, trendDateCandidates } from "./trustTrend";

function point(day: number, strong: number, any: number): ReportTrustHistoryPoint {
  const capturedAt = `2026-07-${String(day).padStart(2, "0")}T12:00:00.000Z`;
  return {
    id: capturedAt,
    url: `/report/${day}`,
    capturedAt,
    total: 10,
    byLevel: {
      stagedPublish: 0,
      trustedPublisher: strong,
      provenance: any - strong,
      none: 10 - any,
    },
    deprecated: 0,
    failureCount: 0,
  };
}

describe("trust trend date labels", () => {
  it("uses boundaries and only dates where a plotted percentage changed", () => {
    const candidates = trendDateCandidates([
      point(1, 2, 4),
      point(2, 2, 4),
      point(3, 3, 4),
      point(4, 3, 6),
      point(5, 3, 6),
    ]);

    expect(candidates.map(({ index }) => index)).toEqual([0, 2, 3, 4]);
  });

  it("keeps the largest non-overlapping changes plus both range boundaries", () => {
    const candidates = [
      { index: 0, importance: Infinity },
      { index: 1, importance: 1 },
      { index: 2, importance: 20 },
      { index: 3, importance: 5 },
      { index: 6, importance: Infinity },
    ];
    const xAt = (index: number) => index * 20;

    const selected = spacedTrendDateIndices(candidates, xAt, 35);

    expect(selected).toEqual([0, 2, 6]);
    expect(
      selected.slice(1).every((index, offset) => xAt(index) - xAt(selected[offset]) >= 35),
    ).toBe(true);
  });

  it("handles empty and one-point histories", () => {
    expect(trendDateCandidates([])).toEqual([]);
    expect(trendDateCandidates([point(1, 2, 4)])).toEqual([{ index: 0, importance: Infinity }]);
  });
});
