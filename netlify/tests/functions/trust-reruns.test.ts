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
  lastRunAt: Date | null;
  lastReportId: string | null;
  lastError: string | null;
  consecutiveFailures: number;
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
  reports: Map<string, StoredReport>,
  history: Map<string, StoredTrustHistory>,
  schedules: Map<string, StoredRerunSchedule>,
) {
  return {
    select: vi.fn(() => ({
      from: vi.fn((table: unknown) => {
        if (tableName(table) === "report_rerun_schedules") {
          return {
            where: vi.fn(() => ({
              orderBy: vi.fn(() => ({
                limit: vi.fn(async (limit: number) =>
                  [...schedules.values()]
                    .filter((row) => row.enabled && row.nextRunAt <= new Date())
                    .toSorted((a, b) => a.nextRunAt.getTime() - b.nextRunAt.getTime())
                    .slice(0, limit),
                ),
              })),
            })),
          };
        }

        return { where: vi.fn(async () => []) };
      }),
    })),
    insert: vi.fn((table: unknown) => ({
      values: vi.fn((row: StoredReport | StoredTrustHistory) => ({
        onConflictDoNothing: vi.fn(async () => {
          if (tableName(table) === "report_trust_history") {
            const item = row as StoredTrustHistory;
            if (!history.has(item.reportId)) history.set(item.reportId, item);
            return;
          }
          const item = row as StoredReport;
          if (!reports.has(item.id)) reports.set(item.id, item);
        }),
      })),
    })),
    update: vi.fn((table: unknown) => ({
      set: vi.fn((values: Partial<StoredRerunSchedule>) => ({
        where: vi.fn(async (predicate: unknown) => {
          if (tableName(table) !== "report_rerun_schedules") return;
          const orgKey = predicateValue(predicate);
          if (!orgKey) return;
          const current = schedules.get(orgKey);
          if (current) schedules.set(orgKey, { ...current, ...values });
        }),
      })),
    })),
  };
}

async function loadProcessor(
  schedules: Map<string, StoredRerunSchedule>,
  reports = new Map<string, StoredReport>(),
  history = new Map<string, StoredTrustHistory>(),
) {
  vi.resetModules();
  const db = makeDb(reports, history, schedules);
  const runAudit = vi.fn(async () => ({
    recent: {
      rows: [],
      summary: {
        scopeLabel: "ALL org packages",
        orgs: ["netlify"],
        total: 2,
        provenance: 1,
        trustedPublisher: 1,
        stagedPublish: 0,
        deprecated: 0,
        byLevel: {
          stagedPublish: 0,
          trustedPublisher: 1,
          provenance: 1,
          none: 0,
        },
      },
    },
    failures: [],
  }));

  vi.doMock("drizzle-orm", async (importOriginal) => {
    const actual = await importOriginal<typeof import("drizzle-orm")>();
    return {
      ...actual,
      and: vi.fn((...predicates: unknown[]) => ({ predicates })),
      asc: vi.fn((column: unknown) => ({ column })),
      eq: vi.fn((_column: unknown, value: unknown) => ({ value })),
      lte: vi.fn((_column: unknown, value: unknown) => ({ value })),
    };
  });
  vi.doMock("../../../db/index.js", () => ({ db }));
  vi.doMock("../../../src/lib/runAudit.js", () => ({ runAudit }));

  const mod = await import("../../functions/_shared/report-schedules");
  return { ...mod, db, runAudit, reports, history, schedules };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-06-28T12:00:00.000Z"));
});

afterEach(() => {
  vi.useRealTimers();
  vi.doUnmock("drizzle-orm");
  vi.doUnmock("../../../db/index.js");
  vi.doUnmock("../../../src/lib/runAudit.js");
});

describe("trust rerun schedules", () => {
  it("runs due package trust schedules through the shared audit and save path", async () => {
    const schedules = new Map<string, StoredRerunSchedule>([
      [
        "netlify",
        {
          orgKey: "netlify",
          orgs: ["netlify"],
          enabled: true,
          nextRunAt: new Date("2026-06-28T11:00:00.000Z"),
          lastRunAt: null,
          lastReportId: "netlify-old",
          lastError: null,
          consecutiveFailures: 0,
        },
      ],
    ]);
    const { processDueTrustReruns, runAudit, reports, history } = await loadProcessor(schedules);

    await expect(processDueTrustReruns()).resolves.toEqual({
      checked: 1,
      succeeded: 1,
      failed: 0,
    });

    expect(runAudit).toHaveBeenCalledWith(
      {
        orgs: ["netlify"],
        months: 12,
        all: true,
        bots: [],
        jobs: 12,
      },
      ["recent"],
      [],
      expect.any(Function),
    );
    const savedId = schedules.get("netlify")?.lastReportId;
    expect(savedId).toMatch(/^netlify-2026-06-28-[a-f0-9]{8}$/);
    expect(schedules.get("netlify")).toMatchObject({
      lastRunAt: new Date("2026-06-28T12:00:00.000Z"),
      nextRunAt: new Date("2026-06-29T12:00:00.000Z"),
      lastError: null,
      consecutiveFailures: 0,
    });
    expect(reports.has(savedId!)).toBe(true);
    expect(history.get(savedId!)).toMatchObject({
      reportId: savedId,
      orgKey: "netlify",
      orgs: ["netlify"],
      total: 2,
      trustedPublisher: 1,
      provenance: 1,
    });
  });

  it("declares an hourly background schedule", async () => {
    await loadProcessor(new Map());
    const mod = await import("../../functions/trust-reruns-background");

    expect(mod.config).toEqual({
      schedule: "@hourly",
      background: true,
    });
  });
});
