import { boolean, index, integer, jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";

// One saved audit report. The primary key is a human-readable slug of the
// form `<orgs>-<yyyy-mm-dd>-<shorthash>` (e.g. `netlify-2026-06-17-1a2b3c4d`),
// generated server-side from the report's content. `payload` holds the whole
// AuditResult plus the config snapshot it was run with, so /report/:id can
// re-render it without re-running the audit.
export const reports = pgTable("reports", {
  id: text().primaryKey(),
  orgs: text().notNull(),
  scopeLabel: text("scope_label").notNull().default(""),
  payload: jsonb().notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const reportTrustHistory = pgTable(
  "report_trust_history",
  {
    reportId: text("report_id")
      .primaryKey()
      .references(() => reports.id, { onDelete: "cascade" }),
    orgKey: text("org_key").notNull(),
    orgs: jsonb("orgs_json").$type<string[]>().notNull(),
    capturedAt: timestamp("captured_at").notNull(),
    total: integer().notNull(),
    stagedPublish: integer("staged_publish").notNull(),
    trustedPublisher: integer("trusted_publisher").notNull(),
    provenance: integer().notNull(),
    none: integer().notNull(),
    deprecated: integer().notNull(),
    failureCount: integer("failure_count").notNull(),
  },
  (table) => [
    index("report_trust_history_org_key_idx").on(table.orgKey),
    index("report_trust_history_captured_at_idx").on(table.capturedAt),
  ],
);

export const reportRerunSchedules = pgTable(
  "report_rerun_schedules",
  {
    orgKey: text("org_key").primaryKey(),
    orgs: jsonb("orgs_json").$type<string[]>().notNull(),
    enabled: boolean().notNull().default(true),
    nextRunAt: timestamp("next_run_at").notNull(),
    lastRunAt: timestamp("last_run_at"),
    lastReportId: text("last_report_id").references(() => reports.id, { onDelete: "set null" }),
    lastError: text("last_error"),
    consecutiveFailures: integer("consecutive_failures").notNull().default(0),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
  },
  (table) => [
    index("report_rerun_schedules_enabled_next_run_at_idx").on(table.enabled, table.nextRunAt),
    index("report_rerun_schedules_last_report_id_idx").on(table.lastReportId),
  ],
);

export type AuditJobStatus = "running" | "done" | "error";

/** One streamed progress line, addressable by `seq` so a reconnecting client can
 *  resume after the last line it already saw. */
export interface AuditJobLine {
  seq: number;
  line: string;
}

// A transient, resumable interactive-audit run. The client-facing SSE connection
// is recycled by the platform (~60s), so a long audit must outlive it: the run
// persists its progress log here — keyed by a client-generated jobId — plus, on
// completion, the result and saved report id. A reconnecting client replays lines
// after `from` and tails until `status` leaves 'running'. These rows are
// throwaway (the durable artifact is the saved report in `reports`); a scheduled
// function prunes old ones.
export const auditJobs = pgTable(
  "audit_jobs",
  {
    id: text().primaryKey(),
    request: jsonb().notNull(),
    log: jsonb().$type<AuditJobLine[]>().notNull().default([]),
    status: text().$type<AuditJobStatus>().notNull().default("running"),
    result: jsonb(),
    reportId: text("report_id"),
    error: text(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [index("audit_jobs_created_at_idx").on(table.createdAt)],
);
