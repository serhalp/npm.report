// Shared types for the npm supply-chain audit.

export type ReportKind = "trust" | "manual" | "external";

export interface AuditConfig {
  /** npm org slugs, e.g. ["netlify", "gatsbyjs"]. Not hardcoded — user supplied. */
  orgs: string[];
  /** Recency window in calendar months. */
  months: number;
  /** Analyze all org packages, ignoring the recency window. */
  all: boolean;
  /** CI/bot accounts to exclude from the `manual` report. */
  bots: string[];
  /** Parallel fetch jobs. The UI uses a fixed code constant for this value. */
  jobs: number;
}

export interface PkgMeta {
  name: string;
  version: string;
  /** ISO-8601 UTC publish time of the `latest` dist-tag. */
  publishedAt: string;
  deprecated: boolean;
}

export type TrustLevel = "stagedPublish" | "trustedPublisher" | "provenance" | "none";

export interface TrustStatus {
  provenance: boolean;
  trustedPublisher: boolean;
  stagedPublish: boolean;
  level: TrustLevel;
  /** numeric order: stagedPublish=3 > trustedPublisher=2 > provenance=1 > none=0 */
  order: number;
  publisher: string;
}

/** One row of the `trust` report / recent-packages cache. */
export interface TrustRow {
  pkg: string;
  latestPublish: string;
  version: string;
  level: TrustLevel;
  provenance: boolean;
  trustedPublisher: boolean;
  stagedPublish: boolean;
  publisher: string;
  deprecated: boolean;
  /** weekly downloads; null = unknown ("?" in the shell version). */
  downloads: number | null;
}

export interface TrustSummary {
  scopeLabel: string;
  orgs: string[];
  total: number;
  provenance: number;
  trustedPublisher: number;
  stagedPublish: number;
  deprecated: number;
  byLevel: Record<TrustLevel, number>;
}

export interface TrustReport {
  rows: TrustRow[];
  summary: TrustSummary;
}

export interface ManualRow {
  when: string;
  who: string;
  ref: string; // package@version
}

export interface ManualReport {
  rows: ManualRow[];
  totalScanned: number;
  bots: string[];
  byPublisher: { who: string; count: number }[];
}

export interface ExternalRow {
  user: string;
  pkg: string;
}

export interface ExternalReport {
  rows: ExternalRow[];
  distinctUsers: number;
  byUser: { user: string; count: number }[];
}

export interface UserPublishRow {
  when: string;
  ref: string; // package@version
}

export interface UserPublishReport {
  user: string;
  scanned: number;
  rows: UserPublishRow[];
}

export interface FetchFailure {
  url: string;
  reason: string;
}
