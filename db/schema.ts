import { index, integer, jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";

// One shared audit report. The primary key is a human-readable slug of the
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
