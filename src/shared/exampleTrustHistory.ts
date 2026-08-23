import type { ReportTrustHistoryPoint } from "#shared/reportHistory";

export interface ExampleTrustHistorySnapshot {
  capturedAt: string;
  strong: number;
  any: number;
}

export const EXAMPLE_ORG = "acme";
export const EXAMPLE_TOTAL_PACKAGES = 60;

const START = Date.UTC(2026, 5, 22, 12);
const DAY_MS = 24 * 60 * 60 * 1_000;
const COUNTS: [strong: number, any: number][] = [
  [6, 15],
  [6, 15],
  [6, 15],
  [6, 15],
  [6, 15],
  [7, 16],
  [7, 16],
  [7, 16],
  [7, 16],
  [14, 25],
  [14, 25],
  [14, 25],
  [14, 25],
  [14, 25],
  [14, 25],
  [14, 25],
  [15, 26],
  [15, 26],
  [15, 26],
  [15, 26],
  [19, 31],
  [22, 36],
  [22, 36],
  [22, 36],
  [22, 36],
  [24, 39],
  [24, 39],
  [24, 39],
];

export const EXAMPLE_TRUST_HISTORY: ExampleTrustHistorySnapshot[] = COUNTS.map(
  ([strong, any], index) => ({
    capturedAt: new Date(START + index * DAY_MS).toISOString(),
    strong,
    any,
  }),
);

export const EXAMPLE_TRUST_HISTORY_POINTS: ReportTrustHistoryPoint[] = EXAMPLE_TRUST_HISTORY.map(
  ({ capturedAt, strong, any }) => {
    const stagedPublish = Math.floor(strong / 3);
    const day = capturedAt.slice(0, 10);
    return {
      id: `dev-example-${EXAMPLE_ORG}-${day}`,
      url: `/report/dev-example-${EXAMPLE_ORG}-${day}`,
      capturedAt,
      total: EXAMPLE_TOTAL_PACKAGES,
      byLevel: {
        stagedPublish,
        trustedPublisher: strong - stagedPublish,
        provenance: any - strong,
        none: EXAMPLE_TOTAL_PACKAGES - any,
      },
      deprecated: 3,
      failureCount: 0,
    };
  },
);
