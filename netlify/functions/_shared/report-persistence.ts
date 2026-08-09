import { getDb } from "../../../db/index.ts";
import { type ReportTrustHistoryRow, serializeJson } from "../../../db/schema.ts";
import {
  extractTrustHistory,
  scopeLabelFor,
  type RecentTrustReportLink,
  type ReportTrustHistoryPoint,
  type SharedReportScope,
  type TrustHistorySnapshot,
} from "../../../src/lib/reportHistory.ts";

export interface SaveReportSnapshotInput {
  orgs: string[];
  scope: SharedReportScope;
  scopeLabel?: string;
  capturedAt: string;
  payload: unknown;
}

export interface SavedReportSnapshot {
  id: string;
  history: TrustHistorySnapshot | null;
}

// Turn org names into a URL-safe slug fragment, e.g. ["Netlify","Gatsby"] -> "netlify-gatsby".
export function slugifyOrgs(orgs: string[]): string {
  const joined = (orgs.length ? orgs : ["npm"])
    .join("-")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return joined || "npm";
}

// Build the human-readable primary key: <orgs>-<yyyy-mm-dd>-<shorthash>.
// The short hash is content-derived (sha256 of the payload), so saving an
// identical report yields the same id for the same UTC day.
export async function buildReportId(
  orgs: string[],
  payload: unknown,
  now = new Date(),
): Promise<string> {
  // Web Crypto keeps this module compatible with edge/Deno and Node runtimes.
  const bytes = new TextEncoder().encode(JSON.stringify(payload));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  const hash = Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0"))
    .join("")
    // 16 hex chars (64 bits): wide enough that same-org, same-day content-hash
    // collisions (which onConflictDoNothing would silently coalesce) are infeasible.
    .slice(0, 16);
  const date = now.toISOString().slice(0, 10);
  return `${slugifyOrgs(orgs)}-${date}-${hash}`;
}

export function historyUrl(id: string): string {
  return `/report/${encodeURIComponent(id)}`;
}

export function historyPointFromRow(row: ReportTrustHistoryRow): ReportTrustHistoryPoint {
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

export function recentReportLinkFromRow(row: ReportTrustHistoryRow): RecentTrustReportLink {
  return {
    id: row.reportId,
    url: historyUrl(row.reportId),
    orgs: row.orgs,
    capturedAt: new Date(row.capturedAt).toISOString(),
  };
}

export async function storeTrustHistory(reportId: string, history: TrustHistorySnapshot) {
  const db = getDb();
  await db.sql`
    INSERT INTO report_trust_history (
      report_id,
      org_key,
      orgs_json,
      captured_at,
      total,
      staged_publish,
      trusted_publisher,
      provenance,
      none,
      deprecated,
      failure_count
    ) VALUES (
      ${reportId},
      ${history.orgKey},
      ${serializeJson(history.orgs)}::jsonb,
      ${new Date(history.capturedAt)},
      ${history.total},
      ${history.byLevel.stagedPublish},
      ${history.byLevel.trustedPublisher},
      ${history.byLevel.provenance},
      ${history.byLevel.none},
      ${history.deprecated},
      ${history.failureCount}
    )
    ON CONFLICT (report_id) DO NOTHING
  `;
}

export async function saveReportSnapshot(
  input: SaveReportSnapshotInput,
): Promise<SavedReportSnapshot> {
  const id = await buildReportId(input.orgs, input.payload);
  const scopeLabel = input.scopeLabel ?? scopeLabelFor(input.scope);
  const db = getDb();
  await db.sql`
    INSERT INTO reports (id, orgs, scope_label, payload)
    VALUES (
      ${id},
      ${input.orgs.join(", ")},
      ${scopeLabel},
      ${serializeJson(input.payload)}::jsonb
    )
    ON CONFLICT (id) DO NOTHING
  `;

  const history = extractTrustHistory(input);
  if (history) {
    await storeTrustHistory(id, history);
  }
  return { id, history };
}
