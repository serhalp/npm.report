import type { Config } from "@netlify/functions";
import { getDb } from "../../db/index.js";
import { parseRows, ReportTrustHistoryRowSchema, SharedReportRowSchema } from "../../db/schema.js";
import {
  normalizeOrgs,
  orgKeyFor,
  type RecentTrustReportLink,
} from "../../src/lib/reportHistory.js";
import { historyPointFromRow, recentReportLinkFromRow } from "../_shared/report-persistence.js";
import { scheduleDailyTrustReport } from "./_shared/report-schedules.js";

const RECENT_REPORT_LIMIT = 5;

async function getHistory(url: URL): Promise<Response> {
  const orgs = normalizeOrgs(url.searchParams.getAll("org"));
  if (orgs.length === 0) {
    return new Response("Missing org", { status: 400 });
  }

  const db = getDb();
  const rows = parseRows(
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
      WHERE org_key = ${orgKeyFor(orgs)}
      ORDER BY captured_at ASC
      LIMIT 100
    `,
  );

  return Response.json({
    orgs,
    points: rows.map(historyPointFromRow),
  });
}

async function getRecentReports(): Promise<Response> {
  const db = getDb();
  const rows = parseRows(
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
      ORDER BY captured_at DESC
      LIMIT 100
    `,
  );

  const seen = new Set<string>();
  const recentReports: RecentTrustReportLink[] = [];
  for (const row of rows) {
    if (seen.has(row.orgKey)) continue;
    seen.add(row.orgKey);
    recentReports.push(recentReportLinkFromRow(row));
    if (recentReports.length === RECENT_REPORT_LIMIT) break;
  }

  return Response.json({ reports: recentReports });
}

export default async (req: Request) => {
  const url = new URL(req.url);
  // /api/reports/:id  ->  ["api", "reports", ":id"]
  const parts = url.pathname.split("/").filter(Boolean);
  const id = parts[2];
  const action = parts[3];

  if (req.method === "GET") {
    if (id === "history") return getHistory(url);
    if (id === "recent") return getRecentReports();
    if (!id) return new Response("Not found", { status: 404 });
    const db = getDb();
    const [row] = parseRows(
      SharedReportRowSchema,
      await db.sql<unknown>`
        SELECT
          reports.id,
          reports.orgs,
          reports.scope_label AS "scopeLabel",
          reports.payload,
          reports.created_at AS "createdAt",
          COALESCE(report_rerun_schedules.enabled, ${false}) AS "dailyTrackingEnabled",
          report_rerun_schedules.next_run_at AS "dailyTrackingNextRunAt"
        FROM reports
        LEFT JOIN report_trust_history
          ON report_trust_history.report_id = reports.id
        LEFT JOIN report_rerun_schedules
          ON
            report_rerun_schedules.org_key = report_trust_history.org_key
            AND report_rerun_schedules.enabled = ${true}
        WHERE reports.id = ${id}
      `,
    );
    if (!row) return new Response("Not found", { status: 404 });
    return Response.json(row);
  }

  if (req.method === "POST") {
    if (id && action === "schedule-daily") {
      const status = await scheduleDailyTrustReport(id);
      if (!status) {
        return new Response("Only saved all-package trust reports can be tracked daily.", {
          status: 400,
        });
      }
      return Response.json(status, { status: 201 });
    }
    // Reports are written server-side by the audit-stream edge function, never
    // posted by the browser — so there's no public report-write endpoint.
    return new Response("Not found", { status: 404 });
  }

  return new Response("Method not allowed", { status: 405 });
};

export const config: Config = {
  path: [
    "/api/reports/history",
    "/api/reports/recent",
    "/api/reports/:id",
    "/api/reports/:id/schedule-daily",
  ],
  // Generous ceiling: these are small reads plus the occasional schedule write.
  rateLimit: { windowLimit: 120, windowSize: 60, aggregateBy: ["ip"] },
};
