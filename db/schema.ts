import { pgTable, text, timestamp, jsonb } from 'drizzle-orm/pg-core'

// One shared audit report. The primary key is a human-readable slug of the
// form `<orgs>-<yyyy-mm-dd>-<shorthash>` (e.g. `netlify-2026-06-17-1a2b3c4d`),
// generated server-side from the report's content. `payload` holds the whole
// AuditResult plus the config snapshot it was run with, so /report/:id can
// re-render it without re-running the audit.
export const reports = pgTable('reports', {
  id: text().primaryKey(),
  orgs: text().notNull(),
  scopeLabel: text('scope_label').notNull().default(''),
  payload: jsonb().notNull(),
  createdAt: timestamp('created_at').defaultNow(),
})
