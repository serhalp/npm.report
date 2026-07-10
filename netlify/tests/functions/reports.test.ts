import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

interface StoredReport {
  id: string;
  orgs: string;
  scopeLabel: string;
  payload: unknown;
}

interface StoredTrustHistory {
  reportId: string;
  orgKey: string;
  orgs: string[];
  capturedAt: Date | string;
  total: number;
  stagedPublish: number;
  trustedPublisher: number;
  provenance: number;
  none: number;
  deprecated: number;
  failureCount: number;
}

interface StoredRerunSchedule {
  orgKey: string;
  orgs: string[];
  enabled: boolean;
  nextRunAt: Date;
  lastRunAt?: Date | null;
  lastReportId?: string | null;
  lastError?: string | null;
  consecutiveFailures: number;
  updatedAt?: Date;
}

function tableName(table: unknown): string {
  if (!table || typeof table !== "object") return "";
  const nameSymbol = Object.getOwnPropertySymbols(table).find((symbol) =>
    String(symbol).includes("drizzle:Name"),
  );
  return nameSymbol ? String((table as Record<symbol, unknown>)[nameSymbol]) : "";
}

function predicateValue(predicate: unknown): string | undefined {
  return typeof predicate === "object" && predicate && "value" in predicate
    ? String(predicate.value)
    : undefined;
}

function makeDb(
  rows: Map<string, StoredReport>,
  historyRows: Map<string, StoredTrustHistory>,
  scheduleRows: Map<string, StoredRerunSchedule>,
) {
  const filterHistory = (predicate: unknown) => {
    const value = predicateValue(predicate);
    return [...historyRows.values()].filter(
      (row) => row.orgKey === value || row.reportId === value,
    );
  };

  return {
    select: vi.fn(() => ({
      from: vi.fn((table: unknown) => {
        if (tableName(table) === "report_trust_history") {
          return {
            where: vi.fn((predicate: unknown) => ({
              limit: vi.fn(async (limit: number) => filterHistory(predicate).slice(0, limit)),
              orderBy: vi.fn(() => ({
                limit: vi.fn(async (limit: number) => {
                  return filterHistory(predicate)
                    .toSorted(
                      (a, b) => new Date(a.capturedAt).getTime() - new Date(b.capturedAt).getTime(),
                    )
                    .slice(0, limit);
                }),
              })),
            })),
            orderBy: vi.fn(() => ({
              limit: vi.fn(async (limit: number) =>
                [...historyRows.values()]
                  .toSorted(
                    (a, b) => new Date(b.capturedAt).getTime() - new Date(a.capturedAt).getTime(),
                  )
                  .slice(0, limit),
              ),
            })),
          };
        }

        if (tableName(table) === "report_rerun_schedules") {
          return {
            where: vi.fn(() => ({
              limit: vi.fn(async (limit: number) => [...scheduleRows.values()].slice(0, limit)),
            })),
          };
        }

        return {
          where: vi.fn(async (predicate: unknown) => {
            const id = predicateValue(predicate);
            return id && rows.has(id) ? [rows.get(id)] : [];
          }),
        };
      }),
    })),
    insert: vi.fn((table: unknown) => ({
      values: vi.fn((row: StoredReport | StoredRerunSchedule) => ({
        onConflictDoNothing: vi.fn(async () => {
          if (tableName(table) === "report_trust_history") {
            const historyRow = row as unknown as StoredTrustHistory;
            if (!historyRows.has(historyRow.reportId)) {
              historyRows.set(historyRow.reportId, historyRow);
            }
            return;
          }

          const report = row as StoredReport;
          if (!rows.has(report.id)) rows.set(report.id, report);
        }),
        onConflictDoUpdate: vi.fn(async ({ set }: { set: Partial<StoredRerunSchedule> }) => {
          if (tableName(table) !== "report_rerun_schedules") return;
          const schedule = row as StoredRerunSchedule;
          scheduleRows.set(schedule.orgKey, {
            ...schedule,
            ...set,
          });
        }),
      })),
    })),
  };
}

async function loadHandler(
  rows = new Map<string, StoredReport>(),
  historyRows = new Map<string, StoredTrustHistory>(),
  scheduleRows = new Map<string, StoredRerunSchedule>(),
) {
  vi.resetModules();
  const db = makeDb(rows, historyRows, scheduleRows);
  // Capture the column too (not just the value) so tests can assert predicate
  // correctness — that a query targets org_key / id, not merely "some column".
  const eq = vi.fn((column: unknown, value: unknown) => ({ column, value }));
  vi.doMock("drizzle-orm", async (importOriginal) => {
    const actual = await importOriginal<typeof import("drizzle-orm")>();
    return {
      ...actual,
      and: vi.fn((...predicates: unknown[]) => ({ predicates })),
      asc: vi.fn((column: unknown) => ({ column })),
      desc: vi.fn((column: unknown) => ({ column })),
      eq,
      lte: vi.fn((_column: unknown, value: Date) => ({ value })),
    };
  });
  vi.doMock("../../../db/index.js", () => ({ db }));
  const mod = await import("../../functions/reports");
  return { handler: mod.default, config: mod.config, db, eq, rows, historyRows, scheduleRows };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-06-27T12:00:00.000Z"));
});

afterEach(() => {
  vi.useRealTimers();
  vi.doUnmock("drizzle-orm");
  vi.doUnmock("../../../db/index.js");
});

describe("reports function", () => {
  it("serves public trust history by exact normalized org set without payloads", async () => {
    const alpha: StoredTrustHistory = {
      reportId: "netlify-gatsby-2026-06-26-aaaaaaaa",
      orgKey: "gatsbyjs,netlify",
      orgs: ["gatsbyjs", "netlify"],
      capturedAt: "2026-06-26T10:00:00.000Z",
      total: 4,
      stagedPublish: 0,
      trustedPublisher: 1,
      provenance: 1,
      none: 2,
      deprecated: 0,
      failureCount: 0,
    };
    const beta: StoredTrustHistory = {
      ...alpha,
      reportId: "netlify-gatsby-2026-06-27-bbbbbbbb",
      capturedAt: "2026-06-27T10:00:00.000Z",
      trustedPublisher: 2,
      provenance: 1,
      none: 1,
      failureCount: 1,
    };
    const other: StoredTrustHistory = {
      ...alpha,
      reportId: "netlify-2026-06-27-cccccccc",
      orgKey: "netlify",
      orgs: ["netlify"],
    };
    const historyRows = new Map([
      [beta.reportId, beta],
      [other.reportId, other],
      [alpha.reportId, alpha],
    ]);
    const { handler, eq } = await loadHandler(new Map(), historyRows);
    const schema = await import("../../../db/schema");

    const response = await handler(
      new Request("https://audit.example/api/reports/history?org=Netlify&org=gatsbyjs"),
    );

    expect(response.status).toBe(200);
    // Predicate correctness: the history query filters on the org_key column
    // with the normalized key — a wrong-column query would fail this.
    expect(eq).toHaveBeenCalledWith(schema.reportTrustHistory.orgKey, "gatsbyjs,netlify");
    await expect(response.json()).resolves.toEqual({
      orgs: ["gatsbyjs", "netlify"],
      points: [
        {
          id: alpha.reportId,
          url: `/report/${alpha.reportId}`,
          capturedAt: "2026-06-26T10:00:00.000Z",
          total: 4,
          byLevel: {
            stagedPublish: 0,
            trustedPublisher: 1,
            provenance: 1,
            none: 2,
          },
          deprecated: 0,
          failureCount: 0,
        },
        {
          id: beta.reportId,
          url: `/report/${beta.reportId}`,
          capturedAt: "2026-06-27T10:00:00.000Z",
          total: 4,
          byLevel: {
            stagedPublish: 0,
            trustedPublisher: 2,
            provenance: 1,
            none: 1,
          },
          deprecated: 0,
          failureCount: 1,
        },
      ],
    });
  });

  it("serves recent trust report links deduped by org set", async () => {
    const makeHistory = (
      reportId: string,
      orgKey: string,
      orgs: string[],
      capturedAt: string,
    ): StoredTrustHistory => ({
      reportId,
      orgKey,
      orgs,
      capturedAt,
      total: 4,
      stagedPublish: 0,
      trustedPublisher: 2,
      provenance: 1,
      none: 1,
      deprecated: 0,
      failureCount: 0,
    });
    const historyRows = new Map<string, StoredTrustHistory>(
      [
        makeHistory("netlify-older", "netlify", ["netlify"], "2026-06-20T10:00:00.000Z"),
        makeHistory("netlify-newer", "netlify", ["netlify"], "2026-06-27T10:00:00.000Z"),
        makeHistory("gatsby", "gatsbyjs", ["gatsbyjs"], "2026-06-26T10:00:00.000Z"),
        makeHistory("vite", "vite", ["vite"], "2026-06-25T10:00:00.000Z"),
        makeHistory("svelte", "svelte", ["svelte"], "2026-06-24T10:00:00.000Z"),
        makeHistory("rollup", "rollup", ["rollup"], "2026-06-23T10:00:00.000Z"),
        makeHistory("react", "react", ["react"], "2026-06-22T10:00:00.000Z"),
      ].map((row) => [row.reportId, row]),
    );
    const { handler } = await loadHandler(new Map(), historyRows);

    const response = await handler(new Request("https://audit.example/api/reports/recent"));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      reports: [
        {
          id: "netlify-newer",
          url: "/report/netlify-newer",
          orgs: ["netlify"],
          capturedAt: "2026-06-27T10:00:00.000Z",
        },
        {
          id: "gatsby",
          url: "/report/gatsby",
          orgs: ["gatsbyjs"],
          capturedAt: "2026-06-26T10:00:00.000Z",
        },
        {
          id: "vite",
          url: "/report/vite",
          orgs: ["vite"],
          capturedAt: "2026-06-25T10:00:00.000Z",
        },
        {
          id: "svelte",
          url: "/report/svelte",
          orgs: ["svelte"],
          capturedAt: "2026-06-24T10:00:00.000Z",
        },
        {
          id: "rollup",
          url: "/report/rollup",
          orgs: ["rollup"],
          capturedAt: "2026-06-23T10:00:00.000Z",
        },
      ],
    });
  });

  it("enables daily tracking from saved all-scope trust reports only", async () => {
    const history: StoredTrustHistory = {
      reportId: "netlify-2026-06-27-aaaaaaaa",
      orgKey: "netlify",
      orgs: ["netlify"],
      capturedAt: "2026-06-27T10:00:00.000Z",
      total: 4,
      stagedPublish: 0,
      trustedPublisher: 1,
      provenance: 1,
      none: 2,
      deprecated: 0,
      failureCount: 0,
    };
    const { handler, scheduleRows } = await loadHandler(
      new Map(),
      new Map([[history.reportId, history]]),
    );

    const response = await handler(
      new Request(`https://audit.example/api/reports/${history.reportId}/schedule-daily`, {
        method: "POST",
      }),
    );

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toEqual({
      orgs: ["netlify"],
      enabled: true,
      nextRunAt: "2026-06-28T10:00:00.000Z",
      lastRunAt: null,
      lastReportId: history.reportId,
      consecutiveFailures: 0,
    });
    expect(scheduleRows.get("netlify")).toMatchObject({
      orgKey: "netlify",
      orgs: ["netlify"],
      enabled: true,
      nextRunAt: new Date("2026-06-28T10:00:00.000Z"),
      lastReportId: history.reportId,
      consecutiveFailures: 0,
    });

    const missing = await handler(
      new Request("https://audit.example/api/reports/manual-only/schedule-daily", {
        method: "POST",
      }),
    );
    expect(missing.status).toBe(400);
  });

  it("serves stored reports and returns 404 for missing ids", async () => {
    const row: StoredReport = {
      id: "netlify-2026-06-27-deadbeef",
      orgs: "netlify",
      scopeLabel: "last 6 months",
      payload: { failures: [] },
    };
    const { handler, eq } = await loadHandler(new Map([[row.id, row]]));
    const schema = await import("../../../db/schema");

    const found = await handler(new Request(`https://audit.example/api/reports/${row.id}`));

    expect(found.status).toBe(200);
    await expect(found.json()).resolves.toEqual(row);
    // Predicate correctness: the lookup filters on the reports.id column.
    expect(eq).toHaveBeenCalledWith(schema.reports.id, row.id);

    const missing = await handler(new Request("https://audit.example/api/reports/missing"));

    expect(missing.status).toBe(404);
    await expect(missing.text()).resolves.toBe("Not found");
  });

  it("has no public report-write endpoint and rejects unsupported methods", async () => {
    const { handler, config } = await loadHandler();

    // Reports are saved server-side by the audit-stream edge function, so there
    // is no browser-facing write route: a bare POST is a no-op 404 and never
    // even reads the body (invalid JSON included).
    await expect(
      handler(
        new Request("https://audit.example/api/reports", { method: "POST", body: "not json" }),
      ),
    ).resolves.toMatchObject({ status: 404 });

    await expect(
      handler(new Request("https://audit.example/api/reports", { method: "DELETE" })),
    ).resolves.toMatchObject({ status: 405 });
    await expect(
      handler(new Request("https://audit.example/api/reports/history")),
    ).resolves.toMatchObject({ status: 400 });

    expect(config).toEqual({
      path: [
        "/api/reports/history",
        "/api/reports/recent",
        "/api/reports/:id",
        "/api/reports/:id/schedule-daily",
      ],
      rateLimit: { windowLimit: 120, windowSize: 60, aggregateBy: ["ip"] },
    });
  });
});
