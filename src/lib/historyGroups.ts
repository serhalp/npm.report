import type { ReportTrustHistoryPoint } from "./reportHistory.ts";

export interface TrustHistoryPointGroup {
  start: ReportTrustHistoryPoint;
  end: ReportTrustHistoryPoint;
  points: ReportTrustHistoryPoint[];
}

const DAY_MS = 24 * 60 * 60 * 1_000;

function utcDay(value: string): number | null {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

function followsOnNextDay(
  previous: ReportTrustHistoryPoint,
  current: ReportTrustHistoryPoint,
): boolean {
  const previousDay = utcDay(previous.capturedAt);
  const currentDay = utcDay(current.capturedAt);
  return previousDay !== null && currentDay !== null && currentDay - previousDay === DAY_MS;
}

function hasSameReportData(left: ReportTrustHistoryPoint, right: ReportTrustHistoryPoint): boolean {
  return (
    left.total === right.total &&
    left.byLevel.stagedPublish === right.byLevel.stagedPublish &&
    left.byLevel.trustedPublisher === right.byLevel.trustedPublisher &&
    left.byLevel.provenance === right.byLevel.provenance &&
    left.byLevel.none === right.byLevel.none &&
    left.deprecated === right.deprecated &&
    // A failed lookup can make an otherwise identical result incomplete, so it
    // remains a visible boundary.
    left.failureCount === right.failureCount
  );
}

export function groupTrustHistoryPoints(
  points: readonly ReportTrustHistoryPoint[],
): TrustHistoryPointGroup[] {
  const groups: TrustHistoryPointGroup[] = [];

  for (const point of points) {
    const current = groups.at(-1);
    if (current && followsOnNextDay(current.end, point) && hasSameReportData(current.end, point)) {
      current.end = point;
      current.points.push(point);
      continue;
    }

    groups.push({ start: point, end: point, points: [point] });
  }

  return groups;
}
