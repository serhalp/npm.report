// @vitest-environment node
import type { DatabaseConnection } from "@netlify/database";
import type { NetlifyDB } from "@netlify/database-dev";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  parseRows,
  ReportRerunScheduleRowSchema,
  ReportRowSchema,
  ReportTrustHistoryRowSchema,
} from "#db/schema";
import { EXAMPLE_TRUST_HISTORY } from "#shared/exampleTrustHistory";
import { parseOrNull, AuditResultSchema } from "#shared/schemas";
import { buildExampleSeedSql } from "../../../db/seed-local.js";
import { resetTestDatabase, startTestDatabase, stopTestDatabase } from "../database.js";

let database: DatabaseConnection;
let local: NetlifyDB;

beforeAll(async () => {
  const started = await startTestDatabase();
  local = started.local;
  const { getDatabase } = await import("@netlify/database");
  database = getDatabase({ connectionString: started.connectionString });
});

beforeEach(async () => resetTestDatabase(database));

afterAll(async () => stopTestDatabase(local, database));

describe("local example data", () => {
  it("seeds a repeatable, internally consistent trust history", async () => {
    await database.pool.query(buildExampleSeedSql());
    await database.pool.query(buildExampleSeedSql());

    const reports = parseRows(
      ReportRowSchema,
      await database.sql<unknown>`
        SELECT
          id,
          orgs,
          scope_label AS "scopeLabel",
          payload,
          created_at AS "createdAt"
        FROM reports
        ORDER BY created_at ASC
      `,
    );
    const history = parseRows(
      ReportTrustHistoryRowSchema,
      await database.sql<unknown>`
        SELECT
          report_id AS "reportId",
          org_key AS "orgKey",
          orgs_json AS orgs,
          captured_at AS "capturedAt",
          total,
          staged_publish AS "stagedPublish",
          trusted_publisher AS "trustedPublisher",
          provenance,
          none,
          deprecated,
          failure_count AS "failureCount"
        FROM report_trust_history
        ORDER BY captured_at ASC
      `,
    );
    const schedules = parseRows(
      ReportRerunScheduleRowSchema,
      await database.sql<unknown>`
        SELECT
          org_key AS "orgKey",
          orgs_json AS orgs,
          enabled,
          next_run_at AS "nextRunAt",
          last_run_at AS "lastRunAt",
          last_report_id AS "lastReportId",
          last_error AS "lastError",
          consecutive_failures AS "consecutiveFailures"
        FROM report_rerun_schedules
      `,
    );

    expect(reports).toHaveLength(EXAMPLE_TRUST_HISTORY.length);
    expect(history).toHaveLength(EXAMPLE_TRUST_HISTORY.length);
    expect(schedules).toHaveLength(1);
    expect(schedules[0]).toMatchObject({
      orgKey: "acme",
      orgs: ["acme"],
      enabled: true,
      lastReportId: "dev-example-acme-2026-07-19",
      consecutiveFailures: 0,
    });
    for (const point of history) {
      expect(point.stagedPublish + point.trustedPublisher + point.provenance + point.none).toBe(
        point.total,
      );
    }
    for (let index = 1; index < history.length; index++) {
      const previous = history[index - 1];
      const current = history[index];
      expect(current.stagedPublish + current.trustedPublisher).toBeGreaterThanOrEqual(
        previous.stagedPublish + previous.trustedPublisher,
      );
      expect(current.total - current.none).toBeGreaterThanOrEqual(previous.total - previous.none);
    }

    expect(history.at(-1)).toMatchObject({
      total: 60,
      stagedPublish: 8,
      trustedPublisher: 16,
      provenance: 15,
      none: 21,
    });
    expect(
      history.slice(20, 22).map((point) => ({
        day: point.capturedAt.toISOString().slice(0, 10),
        strong: point.stagedPublish + point.trustedPublisher,
        any: point.total - point.none,
      })),
    ).toEqual([
      { day: "2026-07-12", strong: 19, any: 31 },
      { day: "2026-07-13", strong: 22, any: 36 },
    ]);

    const latest = reports.at(-1);
    const payload = latest ? parseOrNull(AuditResultSchema, latest.payload) : null;
    expect(payload?.trust?.rows).toHaveLength(60);
    expect(payload?.trust?.summary.byLevel).toEqual({
      stagedPublish: 8,
      trustedPublisher: 16,
      provenance: 15,
      none: 21,
    });
    expect(payload?.manual).toMatchObject({
      totalScanned: 184,
      bots: ["GitHub Actions"],
      byPublisher: [
        { who: "release-admin", count: 2 },
        { who: "maintainer-2", count: 1 },
      ],
    });
    expect(payload?.manual?.rows).toHaveLength(3);
    expect(payload?.external).toMatchObject({
      distinctUsers: 2,
      byUser: [
        { user: "former-contractor", count: 2 },
        { user: "community-maintainer", count: 1 },
      ],
    });
    expect(payload?.external?.rows).toHaveLength(3);
  });
});
