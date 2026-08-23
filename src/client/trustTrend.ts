import {
  anyTrustCount,
  strongTrustCount,
  trustPercent,
  type ReportTrustHistoryPoint,
} from "#shared/reportHistory";

export interface TrendDateCandidate {
  index: number;
  importance: number;
}

function percentages(point: ReportTrustHistoryPoint): [number, number, number] {
  return [
    trustPercent(strongTrustCount(point), point.total),
    trustPercent(anyTrustCount(point), point.total),
    trustPercent(point.byLevel.none, point.total),
  ];
}

function changeMagnitude(
  previous: ReportTrustHistoryPoint,
  current: ReportTrustHistoryPoint,
): number {
  const before = percentages(previous);
  const after = percentages(current);
  return after.reduce((total, value, index) => total + Math.abs(value - before[index]), 0);
}

/** The range boundaries plus snapshots where at least one plotted series changed. */
export function trendDateCandidates(
  points: readonly ReportTrustHistoryPoint[],
): TrendDateCandidate[] {
  if (points.length === 0) return [];

  const candidates: TrendDateCandidate[] = [{ index: 0, importance: Infinity }];
  for (let index = 1; index < points.length; index++) {
    const importance = changeMagnitude(points[index - 1], points[index]);
    if (importance > 0) candidates.push({ index, importance });
  }

  const lastIndex = points.length - 1;
  if (lastIndex > 0 && candidates.at(-1)?.index !== lastIndex) {
    candidates.push({ index: lastIndex, importance: Infinity });
  } else if (lastIndex > 0) {
    candidates.at(-1)!.importance = Infinity;
  }

  return candidates;
}

/** Select the most meaningful change dates whose labels fit without overlapping. */
export function spacedTrendDateIndices(
  candidates: readonly TrendDateCandidate[],
  xAt: (index: number) => number,
  minimumSpacing: number,
): number[] {
  if (candidates.length <= 2) return candidates.map(({ index }) => index);

  const first = candidates[0];
  const last = candidates.at(-1)!;
  const selected = [first, last];
  const internal = candidates
    .slice(1, -1)
    .toSorted((left, right) => right.importance - left.importance || left.index - right.index);

  for (const candidate of internal) {
    const x = xAt(candidate.index);
    if (selected.every((existing) => Math.abs(xAt(existing.index) - x) >= minimumSpacing)) {
      selected.push(candidate);
    }
  }

  return selected.map(({ index }) => index).toSorted((left, right) => left - right);
}
