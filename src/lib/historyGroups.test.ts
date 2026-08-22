import { describe, expect, it } from "vitest";
import type { TrustLevel } from "./types";
import type { ReportTrustHistoryPoint } from "./reportHistory";
import { groupTrustHistoryPoints } from "./historyGroups";

function point(
  day: number,
  overrides: Partial<Omit<ReportTrustHistoryPoint, "byLevel">> & {
    byLevel?: Partial<Record<TrustLevel, number>>;
  } = {},
): ReportTrustHistoryPoint {
  const { byLevel, ...rest } = overrides;
  const date = `2026-07-${String(day).padStart(2, "0")}`;
  return {
    id: date,
    url: `/report/${date}`,
    capturedAt: `${date}T12:00:00.000Z`,
    total: 10,
    byLevel: {
      stagedPublish: 2,
      trustedPublisher: 3,
      provenance: 1,
      none: 4,
      ...byLevel,
    },
    deprecated: 0,
    failureCount: 0,
    ...rest,
  };
}

describe("groupTrustHistoryPoints", () => {
  it("groups unchanged consecutive days while preserving every point in order", () => {
    const points = [point(1), point(2), point(3), point(4, { total: 11 }), point(5)];

    const groups = groupTrustHistoryPoints(points);

    expect(groups).toHaveLength(3);
    expect(groups[0]).toEqual({ start: points[0], end: points[2], points: points.slice(0, 3) });
    expect(groups[1]).toEqual({ start: points[3], end: points[3], points: [points[3]] });
    expect(groups[2]).toEqual({ start: points[4], end: points[4], points: [points[4]] });
    expect(groups.flatMap((group) => group.points)).toEqual(points);
    expect(points).toHaveLength(5);
  });

  it.each<TrustLevel>(["stagedPublish", "trustedPublisher", "provenance", "none"])(
    "starts a new group when the %s count changes",
    (level) => {
      const points = [point(1), point(2, { byLevel: { [level]: 9 } })];

      expect(groupTrustHistoryPoints(points)).toHaveLength(2);
    },
  );

  it("keeps a failure-count change visible even when trust counts are unchanged", () => {
    const points = [point(1), point(2, { failureCount: 1 }), point(3, { failureCount: 1 })];

    expect(groupTrustHistoryPoints(points).map((group) => group.points)).toEqual([
      [points[0]],
      [points[1], points[2]],
    ]);
  });

  it("starts a new group when the deprecated count changes", () => {
    const points = [point(1), point(2, { deprecated: 3 })];

    expect(groupTrustHistoryPoints(points).map((group) => group.points)).toEqual([
      [points[0]],
      [points[1]],
    ]);
  });

  it("does not imply continuity across a missing calendar day", () => {
    const points = [point(1), point(3)];

    expect(groupTrustHistoryPoints(points).map((group) => group.points)).toEqual([
      [points[0]],
      [points[1]],
    ]);
  });

  it("handles empty and single-point histories", () => {
    expect(groupTrustHistoryPoints([])).toEqual([]);

    const only = point(1);
    expect(groupTrustHistoryPoints([only])).toEqual([{ start: only, end: only, points: [only] }]);
  });
});
