import type { RecentReport, TrustLevel } from "./types.ts";

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

  const recent = input.payload.recent as RecentReport | undefined;
  if (!recent || !isObject(recent.summary)) return null;

  const summary = recent.summary as unknown as Record<string, unknown>;
  const total = numberFrom(summary.total);
  const deprecated = numberFrom(summary.deprecated);
  const byLevel = readByLevel(summary);
  if (total === null || deprecated === null || !byLevel) return null;

  const orgs = normalizeOrgs(input.orgs.length > 0 ? input.orgs : recent.summary.orgs);
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
