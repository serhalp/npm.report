// @vitest-environment node
import type { DatabaseConnection } from "@netlify/database";
import type { NetlifyDB } from "@netlify/database-dev";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { serializeJson } from "#db/schema";
import { resetTestDatabase, startTestDatabase, stopTestDatabase } from "../database.js";

const defaultAuditResult = {
  trust: {
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
};

const runAudit = vi.fn<typeof import("#audit/runAudit").runAudit>();

let database: DatabaseConnection;
let local: NetlifyDB;
let schedules: typeof import("#node/report-schedules");

async function seedSchedule(): Promise<void> {
  await database.sql`
    INSERT INTO reports (id, orgs, scope_label, payload)
    VALUES (
      ${"netlify-old"},
      ${"netlify"},
      ${"ALL org packages"},
      ${serializeJson({ failures: [] })}::jsonb
    )
  `;
  await database.sql`
    INSERT INTO report_rerun_schedules (
      org_key,
      orgs_json,
      enabled,
      next_run_at,
      last_report_id,
      consecutive_failures
    ) VALUES (
      ${"netlify"},
      ${serializeJson(["netlify"])}::jsonb,
      ${true},
      ${new Date("2026-06-28T11:00:00.000Z")},
      ${"netlify-old"},
      ${0}
    )
  `;
}

async function readSchedule() {
  const [row] = await database.sql<{
    enabled: boolean;
    nextRunAt: Date;
    lastRunAt: Date | null;
    lastReportId: string | null;
    lastError: string | null;
    consecutiveFailures: number;
  }>`
    SELECT
      enabled,
      next_run_at AS "nextRunAt",
      last_run_at AS "lastRunAt",
      last_report_id AS "lastReportId",
      last_error AS "lastError",
      consecutive_failures AS "consecutiveFailures"
    FROM report_rerun_schedules
    WHERE org_key = ${"netlify"}
  `;
  return row;
}

beforeAll(async () => {
  const started = await startTestDatabase();
  local = started.local;
  vi.stubEnv("NETLIFY_DB_URL", started.connectionString);
  vi.stubEnv("NETLIFY_DB_DRIVER", "server");
  vi.resetModules();
  vi.doMock("#audit/runAudit", () => ({ runAudit }));
  database = (await import("#db/index")).getDb();
  schedules = await import("#node/report-schedules");
});

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-06-28T12:00:00.000Z"));
  runAudit.mockReset();
  runAudit.mockResolvedValue(defaultAuditResult);
  await resetTestDatabase(database);
  await seedSchedule();
});

afterEach(() => vi.useRealTimers());

afterAll(async () => {
  await stopTestDatabase(local, database);
  vi.doUnmock("#audit/runAudit");
  vi.unstubAllEnvs();
});

describe("trust rerun schedules", () => {
  it("runs due package trust schedules through the shared audit and save path", async () => {
    await expect(schedules.processDueTrustReruns()).resolves.toEqual({
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
      ["trust"],
      [],
      expect.any(Function),
    );
    const schedule = await readSchedule();
    expect(schedule?.lastReportId).toMatch(/^netlify-2026-06-28-[a-f0-9]{16}$/);
    expect(schedule).toMatchObject({
      lastRunAt: new Date("2026-06-28T12:00:00.000Z"),
      nextRunAt: new Date("2026-06-29T12:00:00.000Z"),
      lastError: null,
      consecutiveFailures: 0,
    });

    const [{ reportCount, historyCount }] = await database.sql<{
      reportCount: number;
      historyCount: number;
    }>`
      SELECT
        (SELECT count(*)::int FROM reports) AS "reportCount",
        (SELECT count(*)::int FROM report_trust_history) AS "historyCount"
    `;
    expect(reportCount).toBe(2);
    expect(historyCount).toBe(1);
  });

  it("records a failure and keeps the schedule enabled when the rerun throws", async () => {
    runAudit.mockRejectedValueOnce(new Error("registry down"));

    await expect(schedules.processDueTrustReruns()).resolves.toEqual({
      checked: 1,
      succeeded: 0,
      failed: 1,
    });

    expect(await readSchedule()).toMatchObject({
      enabled: true,
      consecutiveFailures: 1,
      lastError: "registry down",
      nextRunAt: new Date("2026-06-28T13:00:00.000Z"),
    });
  });

  it("succeeds without storing history when no trust summary can be extracted", async () => {
    runAudit.mockResolvedValueOnce({ failures: [] });

    await expect(schedules.processDueTrustReruns()).resolves.toEqual({
      checked: 1,
      succeeded: 1,
      failed: 0,
    });

    const [{ reportCount, historyCount }] = await database.sql<{
      reportCount: number;
      historyCount: number;
    }>`
      SELECT
        (SELECT count(*)::int FROM reports) AS "reportCount",
        (SELECT count(*)::int FROM report_trust_history) AS "historyCount"
    `;
    expect(reportCount).toBe(2);
    expect(historyCount).toBe(0);
    expect(await readSchedule()).toMatchObject({ consecutiveFailures: 0, lastError: null });
  });

  it("declares an hourly background schedule", async () => {
    const background = await import("../../functions/trust-reruns-background.js");
    expect(background.config).toEqual({ schedule: "@hourly", background: true });
  });
});
