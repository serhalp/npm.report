import { createHash } from "node:crypto";
import { db } from "../../../db/index.js";
import { reportTrustHistory, reports } from "../../../db/schema.js";
import {
  extractTrustHistory,
  scopeLabelFor,
  type RecentTrustReportLink,
  type ReportTrustHistoryPoint,
  type SharedReportScope,
  type TrustHistorySnapshot,
} from "../../../src/lib/reportHistory.js";

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
export function buildReportId(orgs: string[], payload: unknown, now = new Date()): string {
  const hash = createHash("sha256").update(JSON.stringify(payload)).digest("hex").slice(0, 8);
  const date = now.toISOString().slice(0, 10);
  return `${slugifyOrgs(orgs)}-${date}-${hash}`;
}

export function historyUrl(id: string): string {
  return `/report/${encodeURIComponent(id)}`;
}

export function historyPointFromRow(
  row: typeof reportTrustHistory.$inferSelect,
): ReportTrustHistoryPoint {
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

export function recentReportLinkFromRow(
  row: typeof reportTrustHistory.$inferSelect,
): RecentTrustReportLink {
  return {
    id: row.reportId,
    url: historyUrl(row.reportId),
    orgs: row.orgs,
    capturedAt: new Date(row.capturedAt).toISOString(),
  };
}

export async function storeTrustHistory(reportId: string, history: TrustHistorySnapshot) {
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

export async function saveReportSnapshot(
  input: SaveReportSnapshotInput,
): Promise<SavedReportSnapshot> {
  const id = buildReportId(input.orgs, input.payload);
  const scopeLabel = input.scopeLabel ?? scopeLabelFor(input.scope);
  await db
    .insert(reports)
    .values({
      id,
      orgs: input.orgs.join(", "),
      scopeLabel,
      payload: input.payload,
    })
    .onConflictDoNothing();

  const history = extractTrustHistory(input);
  if (history) {
    await storeTrustHistory(id, history);
  }
  return { id, history };
}
