import { eq, lt, sql } from "drizzle-orm";
import { db } from "../../../db/index.ts";
import { type AuditJobLine, type AuditJobStatus, auditJobs } from "../../../db/schema.ts";

// Persistence for a resumable interactive audit (see the `auditJobs` table). The
// audit-stream edge function is the only writer; a reconnecting client reads
// through the same rows via the tail path. Kept edge-safe (Web APIs only, no
// node: builtins) since it is bundled into the edge function.

type AuditJobRow = typeof auditJobs.$inferSelect;

/** Create the job row for a fresh run. Returns true if THIS call created it, and
 *  false if a row already exists — i.e. this request is a reconnect that should
 *  tail the existing run rather than start a second audit. Atomic, so two racing
 *  requests for the same id can't both run the audit. */
export async function createJobIfAbsent(id: string, request: unknown): Promise<boolean> {
  const inserted = await db
    .insert(auditJobs)
    .values({ id, request })
    .onConflictDoNothing()
    .returning({ id: auditJobs.id });
  return inserted.length > 0;
}

/** Persist the running run's progress log. The caller passes the full array (its
 *  in-memory copy is the source of truth), so this is a last-write-wins overwrite. */
export async function updateJobLog(id: string, log: AuditJobLine[]): Promise<void> {
  await db
    .update(auditJobs)
    .set({ log, updatedAt: sql`now()` })
    .where(eq(auditJobs.id, id));
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
  await db
    .update(auditJobs)
    .set({
      status: input.status,
      log: input.log,
      result: input.result ?? null,
      reportId: input.reportId ?? null,
      error: input.error ?? null,
      updatedAt: sql`now()`,
    })
    .where(eq(auditJobs.id, id));
}

export async function getJob(id: string): Promise<AuditJobRow | null> {
  const rows = await db.select().from(auditJobs).where(eq(auditJobs.id, id)).limit(1);
  return rows[0] ?? null;
}

/** Prune throwaway job rows. Called by the scheduled cleanup function; the durable
 *  artifact is the saved report in `reports`, so these can go once no client is
 *  still reconnecting to them. */
export async function deleteExpiredJobs(olderThan = "2 hours"): Promise<void> {
  await db.delete(auditJobs).where(lt(auditJobs.createdAt, sql`now() - ${olderThan}::interval`));
}
