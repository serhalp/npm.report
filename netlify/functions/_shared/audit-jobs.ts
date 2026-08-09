import { getDb } from "../../../db/index.ts";
import {
  type AuditJobLine,
  type AuditJobRow,
  AuditJobRowSchema,
  type AuditJobStatus,
  IdRowSchema,
  parseRows,
  serializeJson,
} from "../../../db/schema.ts";

// Persistence for a resumable interactive audit (see the `auditJobs` table). The
// audit-stream edge function is the only writer; a reconnecting client reads
// through the same rows via the tail path. Kept edge-safe (Web APIs only, no
// node: builtins) since it is bundled into the edge function.

/** Create the job row for a fresh run. Returns true if THIS call created it, and
 *  false if a row already exists — i.e. this request is a reconnect that should
 *  tail the existing run rather than start a second audit. Atomic, so two racing
 *  requests for the same id can't both run the audit. */
export async function createJobIfAbsent(id: string, request: unknown): Promise<boolean> {
  const db = getDb();
  const inserted = parseRows(
    IdRowSchema,
    await db.sql<unknown>`
      INSERT INTO audit_jobs (id, request)
      VALUES (${id}, ${serializeJson(request)}::jsonb)
      ON CONFLICT (id) DO NOTHING
      RETURNING id
    `,
  );
  return inserted.length > 0;
}

/** Persist the running run's progress log. The caller passes the full array (its
 *  in-memory copy is the source of truth), so this is a last-write-wins overwrite. */
export async function updateJobLog(id: string, log: AuditJobLine[]): Promise<void> {
  const db = getDb();
  await db.sql`
    UPDATE audit_jobs
    SET log = ${serializeJson(log)}::jsonb, updated_at = now()
    WHERE id = ${id}
  `;
}

interface FinishJobInput {
  status: Exclude<AuditJobStatus, "running">;
  log: AuditJobLine[];
  result?: unknown;
  reportId?: string | null;
  error?: string | null;
}

/** Mark the run terminal, storing the final log plus (on success) the result and
 *  saved report id, or (on failure) the error message. */
export async function finishJob(id: string, input: FinishJobInput): Promise<void> {
  const db = getDb();
  await db.sql`
    UPDATE audit_jobs
    SET
      status = ${input.status},
      log = ${serializeJson(input.log)}::jsonb,
      result = ${input.result == null ? null : serializeJson(input.result)}::jsonb,
      report_id = ${input.reportId ?? null},
      error = ${input.error ?? null},
      updated_at = now()
    WHERE id = ${id}
  `;
}

export async function getJob(id: string): Promise<AuditJobRow | null> {
  const db = getDb();
  const rows = parseRows(
    AuditJobRowSchema,
    await db.sql<unknown>`
      SELECT
        id,
        request,
        log,
        status,
        result,
        report_id AS "reportId",
        error,
        created_at AS "createdAt",
        updated_at AS "updatedAt"
      FROM audit_jobs
      WHERE id = ${id}
      LIMIT 1
    `,
  );
  return rows[0] ?? null;
}

/** Prune throwaway job rows. Called by the scheduled cleanup function; the durable
 *  artifact is the saved report in `reports`, so these can go once no client is
 *  still reconnecting to them. */
export async function deleteExpiredJobs(olderThan = "2 hours"): Promise<void> {
  const db = getDb();
  await db.sql`
    DELETE FROM audit_jobs
    WHERE created_at < now() - ${olderThan}::interval
  `;
}
