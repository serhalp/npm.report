import type { Config } from "@netlify/functions";
import { asc, desc, eq } from "drizzle-orm";
import { db } from "../../db/index.js";
import { reportTrustHistory, reports } from "../../db/schema.js";
import {
  normalizeOrgs,
  orgKeyFor,
  type RecentTrustReportLink,
} from "../../src/lib/reportHistory.js";
import { historyPointFromRow, recentReportLinkFromRow } from "./_shared/report-persistence.js";
import { scheduleDailyTrustReport } from "./_shared/report-schedules.js";

const RECENT_REPORT_LIMIT = 5;

async function getHistory(url: URL): Promise<Response> {
  const orgs = normalizeOrgs(url.searchParams.getAll("org"));
  if (orgs.length === 0) {
    return new Response("Missing org", { status: 400 });
  }

  const rows = await db
    .select()
    .from(reportTrustHistory)
    .where(eq(reportTrustHistory.orgKey, orgKeyFor(orgs)))
    .orderBy(asc(reportTrustHistory.capturedAt))
    .limit(100);

  return Response.json({
    orgs,
    points: rows.map(historyPointFromRow),
  });
}

async function getRecentReports(): Promise<Response> {
  const rows = await db
    .select()
    .from(reportTrustHistory)
    .orderBy(desc(reportTrustHistory.capturedAt))
    .limit(100);

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
    const [row] = await db.select().from(reports).where(eq(reports.id, id));
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
