import type { Config } from "@netlify/functions";
import { asc, desc, eq } from "drizzle-orm";
import { db } from "../../db/index.js";
import { reportTrustHistory, reports } from "../../db/schema.js";
import {
  normalizeOrgs,
  orgKeyFor,
  scopeLabelFor,
  type RecentTrustReportLink,
  type SharedReportScope,
} from "../../src/lib/reportHistory.js";
import {
  historyPointFromRow,
  recentReportLinkFromRow,
  saveReportSnapshot,
} from "./_shared/report-persistence.js";
import { scheduleDailyTrustReport } from "./_shared/report-schedules.js";

const RECENT_REPORT_LIMIT = 5;

function isObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object";
}

function parseScope(value: unknown, scopeLabel: unknown): SharedReportScope {
  if (value === "all") return "all";
  if (isObject(value) && typeof value.months === "number" && Number.isFinite(value.months)) {
    return { months: Math.max(1, Math.floor(value.months)) };
  }
  return scopeLabel === "ALL org packages" ? "all" : { months: 12 };
}

function parseCapturedAt(value: unknown): string {
  if (typeof value === "string" && !Number.isNaN(Date.parse(value))) {
    return new Date(value).toISOString();
  }
  return new Date().toISOString();
}

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

    if (id) return new Response("Not found", { status: 404 });

    let body: {
      orgs?: string[];
      scope?: unknown;
      scopeLabel?: string;
      capturedAt?: string;
      payload?: unknown;
    };
    try {
      body = await req.json();
    } catch {
      return new Response("Invalid JSON", { status: 400 });
    }
    if (!body || typeof body !== "object" || body.payload == null) {
      return new Response("Missing payload", { status: 400 });
    }
    const orgs = Array.isArray(body.orgs) ? body.orgs.map(String) : [];
    const scope = parseScope(body.scope, body.scopeLabel);
    const capturedAt = parseCapturedAt(body.capturedAt);
    const scopeLabel = typeof body.scopeLabel === "string" ? body.scopeLabel : scopeLabelFor(scope);
    const saved = await saveReportSnapshot({
      orgs,
      scope,
      scopeLabel,
      capturedAt,
      payload: body.payload,
    });
    return Response.json({ id: saved.id }, { status: 201 });
  }

  return new Response("Method not allowed", { status: 405 });
};

export const config: Config = {
  path: [
    "/api/reports",
    "/api/reports/history",
    "/api/reports/recent",
    "/api/reports/:id",
    "/api/reports/:id/schedule-daily",
  ],
};
