import type { TrustReport, TrustLevel } from "./types.ts";

export type SharedReportScope = "all" | { months: number };

export interface ReportTrustHistoryPoint {
  id: string;
  url: string;
  capturedAt: string;
  total: number;
  byLevel: Record<TrustLevel, number>;
  deprecated: number;
  failureCount: number;
}

export interface ReportHistoryResponse {
  orgs: string[];
  points: ReportTrustHistoryPoint[];
}

export interface RecentTrustReportLink {
  id: string;
  url: string;
  orgs: string[];
  capturedAt: string;
}

export interface RecentTrustReportsResponse {
  reports: RecentTrustReportLink[];
}

export interface ReportRerunScheduleStatus {
  orgs: string[];
  enabled: boolean;
  nextRunAt: string;
  lastRunAt: string | null;
  lastReportId: string | null;
  consecutiveFailures: number;
}

export interface TrustHistorySnapshot {
  orgKey: string;
  orgs: string[];
  capturedAt: string;
  total: number;
  byLevel: Record<TrustLevel, number>;
  deprecated: number;
  failureCount: number;
}

interface HistoryInput {
  orgs: string[];
  scope: SharedReportScope;
  capturedAt: string;
  payload: unknown;
}

const TRUST_LEVELS: TrustLevel[] = ["stagedPublish", "trustedPublisher", "provenance", "none"];

function isObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object";
}

function numberFrom(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function normalizeOrgSlug(org: string): string {
  return org.trim().toLowerCase();
}

export function normalizeOrgs(orgs: string[]): string[] {
  return [...new Set(orgs.map(normalizeOrgSlug).filter(Boolean))].toSorted();
}

export function orgKeyFor(orgs: string[]): string {
  return normalizeOrgs(orgs).join(",");
}

export function scopeLabelFor(scope: SharedReportScope): string {
  return scope === "all" ? "ALL org packages" : `last ${scope.months} months`;
}

export function isAllScope(scope: SharedReportScope): boolean {
  return scope === "all";
}

// Trust-signal aggregates for the timeline. "Strong" is the two gold-accented
// tiers (staged publish + trusted publisher); "any" is everything that isn't
// "none". Provenance-only lands in `any` but not `strong` — matching how the
// report itself ranks and accents the tiers, so the timeline stops treating a
// provenance-only package as equal to a staged-published one.
export function strongTrustCount(point: ReportTrustHistoryPoint): number {
  return point.byLevel.stagedPublish + point.byLevel.trustedPublisher;
}

export function anyTrustCount(point: ReportTrustHistoryPoint): number {
  return point.total - point.byLevel.none;
}

/** `count` as a percentage of `total` (0 when the point has no packages). */
export function trustPercent(count: number, total: number): number {
  return total > 0 ? (count / total) * 100 : 0;
}

function readByLevel(summary: Record<string, unknown>): Record<TrustLevel, number> | null {
  const raw = summary.byLevel;
  if (!isObject(raw)) return null;

  const byLevel = {} as Record<TrustLevel, number>;
  for (const level of TRUST_LEVELS) {
    const count = numberFrom(raw[level]);
    if (count === null) return null;
    byLevel[level] = count;
  }
  return byLevel;
}

export function extractTrustHistory(input: HistoryInput): TrustHistorySnapshot | null {
  if (!isAllScope(input.scope) || Number.isNaN(Date.parse(input.capturedAt))) return null;
  if (!isObject(input.payload)) return null;

  const trust = input.payload.trust as TrustReport | undefined;
  if (!trust || !isObject(trust.summary)) return null;

  const summary = trust.summary as unknown as Record<string, unknown>;
  const total = numberFrom(summary.total);
  const deprecated = numberFrom(summary.deprecated);
  const byLevel = readByLevel(summary);
  if (total === null || deprecated === null || !byLevel) return null;

  const orgs = normalizeOrgs(input.orgs.length > 0 ? input.orgs : trust.summary.orgs);
  if (orgs.length === 0) return null;

  return {
    orgKey: orgs.join(","),
    orgs,
    capturedAt: new Date(input.capturedAt).toISOString(),
    total,
    byLevel,
    deprecated,
    failureCount: Array.isArray(input.payload.failures) ? input.payload.failures.length : 0,
  };
}
