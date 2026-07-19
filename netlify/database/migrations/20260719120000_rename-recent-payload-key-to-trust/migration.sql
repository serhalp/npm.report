-- Data migration: rename the AuditResult payload key `recent` -> `trust`.
--
-- The report-kind rename (`recent` -> `trust`) changed the shape of data stored
-- inside the `reports.payload` jsonb column. That is not a schema change, so it
-- is not covered by the table migrations: reports saved before the rename keep a
-- `recent` key, which the current code no longer reads (their trust tab would be
-- missing). This rewrites those payloads in place.
--
-- Idempotent: only rows that still carry the old `recent` key are touched, and
-- re-running is a no-op. Rows without it (manual/external-only reports, or reports
-- already saved with `trust`) are left untouched.
UPDATE "reports"
SET "payload" = ("payload" - 'recent') || jsonb_build_object('trust', "payload" -> 'recent')
WHERE "payload" ? 'recent';
