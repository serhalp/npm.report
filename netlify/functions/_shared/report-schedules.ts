/* eslint-disable no-await-in-loop -- Due schedules run sequentially to avoid stacking full org audits against npm APIs. */
import { runAudit } from "#audit/runAudit";
import { getDb } from "#db/index";
import {
  parseRows,
  type ReportRerunScheduleRow,
  ReportRerunScheduleRowSchema,
  ReportTrustHistoryRowSchema,
  serializeJson,
} from "#db/schema";
import { saveReportSnapshot } from "#server/report-persistence";
import { FETCH_CONCURRENCY } from "#shared/auditDefaults";
import type { ReportRerunScheduleStatus } from "#shared/reportHistory";
import type { AuditConfig, AuditResult } from "#shared/types";

const DAY_MS = 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;
const DUE_LIMIT = 3;
const MAX_ERROR_LENGTH = 500;

export interface TrustRerunResult {
  checked: number;
  succeeded: number;
  failed: number;
}

function addMs(value: Date, ms: number): Date {
  return new Date(value.getTime() + ms);
}

function normalizeError(reason: unknown): string {
  const message = reason instanceof Error ? reason.message : String(reason);
  return message.slice(0, MAX_ERROR_LENGTH);
}

function nextDailyRunFrom(capturedAt: Date, now = new Date()): Date {
  const next = addMs(capturedAt, DAY_MS);
  return next > now ? next : addMs(now, DAY_MS);
}

function statusFromRow(row: ReportRerunScheduleRow): ReportRerunScheduleStatus {
  return {
    orgs: row.orgs,
    enabled: row.enabled,
    nextRunAt: new Date(row.nextRunAt).toISOString(),
    lastRunAt: row.lastRunAt ? new Date(row.lastRunAt).toISOString() : null,
    lastReportId: row.lastReportId,
    consecutiveFailures: row.consecutiveFailures,
  };
}

export async function scheduleDailyTrustReport(
  reportId: string,
  now = new Date(),
): Promise<ReportRerunScheduleStatus | null> {
  const db = getDb();
  const [history] = parseRows(
    ReportTrustHistoryRowSchema,
    await db.sql<unknown>`
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
      WHERE report_id = ${reportId}
      LIMIT 1
    `,
  );
  if (!history) return null;

  // Idempotent: if this org set is already tracked, return it unchanged instead
  // of resetting the schedule clock and failure count on every repeated call.
  const [existing] = parseRows(
    ReportRerunScheduleRowSchema,
    await db.sql<unknown>`
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
      WHERE org_key = ${history.orgKey}
      LIMIT 1
    `,
  );
  if (existing?.enabled) return statusFromRow(existing);

  const nextRunAt = nextDailyRunFrom(new Date(history.capturedAt), now);
  await db.sql`
    INSERT INTO report_rerun_schedules (
      org_key,
      orgs_json,
      enabled,
      next_run_at,
      last_report_id,
      last_error,
      consecutive_failures,
      updated_at
    ) VALUES (
      ${history.orgKey},
      ${serializeJson(history.orgs)}::jsonb,
      ${true},
      ${nextRunAt},
      ${reportId},
      ${null},
      ${0},
      ${now}
    )
    ON CONFLICT (org_key) DO UPDATE SET
      orgs_json = EXCLUDED.orgs_json,
      enabled = EXCLUDED.enabled,
      next_run_at = EXCLUDED.next_run_at,
      last_report_id = EXCLUDED.last_report_id,
      last_error = EXCLUDED.last_error,
      consecutive_failures = EXCLUDED.consecutive_failures,
      updated_at = EXCLUDED.updated_at
  `;

  return {
    orgs: history.orgs,
    enabled: true,
    nextRunAt: nextRunAt.toISOString(),
    lastRunAt: null,
    lastReportId: reportId,
    consecutiveFailures: 0,
  };
}

async function runSchedule(row: ReportRerunScheduleRow, now: Date) {
  const db = getDb();
  await db.sql`
    UPDATE report_rerun_schedules
    SET next_run_at = ${addMs(now, HOUR_MS)}, last_error = ${null}, updated_at = ${now}
    WHERE org_key = ${row.orgKey}
  `;

  const capturedAt = new Date().toISOString();
  try {
    const config: AuditConfig = {
      orgs: row.orgs,
      months: 12,
      all: true,
      bots: [],
      jobs: FETCH_CONCURRENCY,
    };
    const payload: AuditResult = await runAudit(config, ["trust"], [], (message) =>
      console.log(`[trust-rerun:${row.orgKey}] ${message}`),
    );
    const saved = await saveReportSnapshot({
      orgs: row.orgs,
      scope: "all",
      capturedAt,
      payload,
    });
    await db.sql`
      UPDATE report_rerun_schedules
      SET
        next_run_at = ${addMs(new Date(capturedAt), DAY_MS)},
        last_run_at = ${new Date(capturedAt)},
        last_report_id = ${saved.id},
        last_error = ${null},
        consecutive_failures = ${0},
        updated_at = ${new Date()}
      WHERE org_key = ${row.orgKey}
    `;
    return true;
  } catch (reason) {
    await db.sql`
      UPDATE report_rerun_schedules
      SET
        next_run_at = ${addMs(now, HOUR_MS)},
        last_error = ${normalizeError(reason)},
        consecutive_failures = ${row.consecutiveFailures + 1},
        updated_at = ${new Date()}
      WHERE org_key = ${row.orgKey}
    `;
    return false;
  }
}

export async function processDueTrustReruns(
  now = new Date(),
  limit = DUE_LIMIT,
): Promise<TrustRerunResult> {
  const db = getDb();
  const due = parseRows(
    ReportRerunScheduleRowSchema,
    await db.sql<unknown>`
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
      WHERE enabled = ${true} AND next_run_at <= ${now}
      ORDER BY next_run_at ASC
      LIMIT ${limit}
    `,
  );

  let succeeded = 0;
  let failed = 0;
  for (const row of due) {
    if (await runSchedule(row, now)) succeeded++;
    else failed++;
  }

  return { checked: due.length, succeeded, failed };
}

export function scheduleStatusFromRowForTest(
  row: ReportRerunScheduleRow,
): ReportRerunScheduleStatus {
  return statusFromRow(row);
}
