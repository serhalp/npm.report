import type { Config } from "@netlify/functions";
import { createHash } from "node:crypto";
import { asc, desc, eq } from "drizzle-orm";
import { db } from "../../db/index.js";
import { reportTrustHistory, reports } from "../../db/schema.js";
import {
  extractTrustHistory,
  normalizeOrgs,
  orgKeyFor,
  scopeLabelFor,
  type RecentTrustReportLink,
  type ReportTrustHistoryPoint,
  type SharedReportScope,
} from "../../src/lib/reportHistory.js";

const RECENT_REPORT_LIMIT = 5;

// Turn org names into a URL-safe slug fragment, e.g. ["Netlify","Gatsby"] -> "netlify-gatsby".
function slugifyOrgs(orgs: string[]): string {
  const joined = (orgs.length ? orgs : ["npm"])
    .join("-")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return joined || "npm";
}

// Build the human-readable primary key: <orgs>-<yyyy-mm-dd>-<shorthash>.
// The short hash is content-derived (sha256 of the payload), so re-sharing an
// identical report yields the same id (idempotent) and ids never collide by
// accident.
function buildId(orgs: string[], payload: unknown): string {
  const hash = createHash("sha256").update(JSON.stringify(payload)).digest("hex").slice(0, 8);
  const date = new Date().toISOString().slice(0, 10);
  return `${slugifyOrgs(orgs)}-${date}-${hash}`;
}

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

function historyUrl(id: string): string {
  return `/report/${encodeURIComponent(id)}`;
}

function historyPointFromRow(row: typeof reportTrustHistory.$inferSelect): ReportTrustHistoryPoint {
  return {
    id: row.reportId,
    url: historyUrl(row.reportId),
    capturedAt: new Date(row.capturedAt).toISOString(),
    total: row.total,
    byLevel: {
      stagedPublish: row.stagedPublish,
      trustedPublisher: row.trustedPublisher,
      provenance: row.provenance,
      none: row.none,
    },
    deprecated: row.deprecated,
    failureCount: row.failureCount,
  };
}

function recentReportLinkFromRow(
  row: typeof reportTrustHistory.$inferSelect,
): RecentTrustReportLink {
  return {
    id: row.reportId,
    url: historyUrl(row.reportId),
    orgs: row.orgs,
    capturedAt: new Date(row.capturedAt).toISOString(),
  };
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

async function storeTrustHistory(
  reportId: string,
  history: NonNullable<ReturnType<typeof extractTrustHistory>>,
) {
  await db
    .insert(reportTrustHistory)
    .values({
      reportId,
      orgKey: history.orgKey,
      orgs: history.orgs,
      capturedAt: new Date(history.capturedAt),
      total: history.total,
      stagedPublish: history.byLevel.stagedPublish,
      trustedPublisher: history.byLevel.trustedPublisher,
      provenance: history.byLevel.provenance,
      none: history.byLevel.none,
      deprecated: history.deprecated,
      failureCount: history.failureCount,
    })
    .onConflictDoNothing();
}

export default async (req: Request) => {
  const url = new URL(req.url);
  // /api/reports/:id  ->  ["", "api", "reports", ":id"]
  const parts = url.pathname.split("/").filter(Boolean);
  const id = parts[2];

  if (req.method === "GET") {
    if (id === "history") return getHistory(url);
    if (id === "recent") return getRecentReports();
    if (!id) return new Response("Not found", { status: 404 });
    const [row] = await db.select().from(reports).where(eq(reports.id, id));
    if (!row) return new Response("Not found", { status: 404 });
    return Response.json(row);
  }

  if (req.method === "POST") {
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
    const newId = buildId(orgs, body.payload);
    await db
      .insert(reports)
      .values({
        id: newId,
        orgs: orgs.join(", "),
        scopeLabel,
        payload: body.payload,
      })
      // Same content + same day = same id; treat a re-share as a no-op.
      .onConflictDoNothing();

    const history = extractTrustHistory({
      orgs,
      scope,
      capturedAt,
      payload: body.payload,
    });
    if (history) {
      await storeTrustHistory(newId, history);
    }
    return Response.json({ id: newId }, { status: 201 });
  }

  return new Response("Method not allowed", { status: 405 });
};

export const config: Config = {
  path: ["/api/reports", "/api/reports/history", "/api/reports/recent", "/api/reports/:id"],
};
