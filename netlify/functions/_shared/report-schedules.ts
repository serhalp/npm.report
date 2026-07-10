/* eslint-disable no-await-in-loop -- Due schedules run sequentially to avoid stacking full org audits against npm APIs. */
import { and, asc, eq, lte } from "drizzle-orm";
import { db } from "../../../db/index.js";
import { reportRerunSchedules, reportTrustHistory } from "../../../db/schema.js";
import { FETCH_CONCURRENCY } from "../../../src/lib/auditDefaults.js";
import type { ReportRerunScheduleStatus } from "../../../src/lib/reportHistory.js";
import type { AuditResult } from "../../../src/lib/runAudit.js";
import { runAudit } from "../../../src/lib/runAudit.js";
import type { AuditConfig } from "../../../src/lib/types.js";
import { saveReportSnapshot } from "./report-persistence.js";

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

function statusFromRow(row: typeof reportRerunSchedules.$inferSelect): ReportRerunScheduleStatus {
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
  const [history] = await db
    .select()
    .from(reportTrustHistory)
    .where(eq(reportTrustHistory.reportId, reportId))
    .limit(1);
  if (!history) return null;

  const nextRunAt = nextDailyRunFrom(new Date(history.capturedAt), now);
  const values = {
    orgKey: history.orgKey,
    orgs: history.orgs,
    enabled: true,
    nextRunAt,
    lastReportId: reportId,
    lastError: null,
    consecutiveFailures: 0,
    updatedAt: now,
  };
  const set = {
    orgs: history.orgs,
    enabled: true,
    nextRunAt,
    lastReportId: reportId,
    lastError: null,
    consecutiveFailures: 0,
    updatedAt: now,
  };

  await db.insert(reportRerunSchedules).values(values).onConflictDoUpdate({
    target: reportRerunSchedules.orgKey,
    set,
  });

  return {
    orgs: history.orgs,
    enabled: true,
    nextRunAt: nextRunAt.toISOString(),
    lastRunAt: null,
    lastReportId: reportId,
    consecutiveFailures: 0,
  };
}

async function runSchedule(row: typeof reportRerunSchedules.$inferSelect, now: Date) {
  await db
    .update(reportRerunSchedules)
    .set({
      nextRunAt: addMs(now, HOUR_MS),
      lastError: null,
      updatedAt: now,
    })
    .where(eq(reportRerunSchedules.orgKey, row.orgKey));

  const capturedAt = new Date().toISOString();
  try {
    const config: AuditConfig = {
      orgs: row.orgs,
      months: 12,
      all: true,
      bots: [],
      jobs: FETCH_CONCURRENCY,
    };
    const payload: AuditResult = await runAudit(config, ["recent"], [], (message) =>
      console.log(`[trust-rerun:${row.orgKey}] ${message}`),
    );
    const saved = await saveReportSnapshot({
      orgs: row.orgs,
      scope: "all",
      capturedAt,
      payload,
    });
    await db
      .update(reportRerunSchedules)
      .set({
        nextRunAt: addMs(new Date(capturedAt), DAY_MS),
        lastRunAt: new Date(capturedAt),
        lastReportId: saved.id,
        lastError: null,
        consecutiveFailures: 0,
        updatedAt: new Date(),
      })
      .where(eq(reportRerunSchedules.orgKey, row.orgKey));
    return true;
  } catch (reason) {
    await db
      .update(reportRerunSchedules)
      .set({
        nextRunAt: addMs(now, HOUR_MS),
        lastError: normalizeError(reason),
        consecutiveFailures: row.consecutiveFailures + 1,
        updatedAt: new Date(),
      })
      .where(eq(reportRerunSchedules.orgKey, row.orgKey));
    return false;
  }
}

export async function processDueTrustReruns(
  now = new Date(),
  limit = DUE_LIMIT,
): Promise<TrustRerunResult> {
  const due = await db
    .select()
    .from(reportRerunSchedules)
    .where(and(eq(reportRerunSchedules.enabled, true), lte(reportRerunSchedules.nextRunAt, now)))
    .orderBy(asc(reportRerunSchedules.nextRunAt))
    .limit(limit);

  let succeeded = 0;
  let failed = 0;
  for (const row of due) {
    if (await runSchedule(row, now)) succeeded++;
    else failed++;
  }

  return { checked: due.length, succeeded, failed };
}

export function scheduleStatusFromRowForTest(
  row: typeof reportRerunSchedules.$inferSelect,
): ReportRerunScheduleStatus {
  return statusFromRow(row);
}
