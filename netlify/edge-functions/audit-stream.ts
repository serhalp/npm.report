/* eslint-disable no-await-in-loop -- The reconnect tail polls the stored log sequentially until the run reaches a terminal state. */
import type { Config } from "@netlify/edge-functions";
import { FETCH_CONCURRENCY, blockedOrgMessage, isBlockedOrg } from "../../src/lib/auditDefaults.ts";
import { scopeLabelFor, type SharedReportScope } from "../../src/lib/reportHistory.ts";
import { AuditRequestSchema, parseOrNull } from "../../src/lib/schemas.ts";
import { type AuditResult, runAudit } from "../../src/lib/runAudit.ts";
import type { AuditConfig, ReportKind } from "../../src/lib/types.ts";
import { saveReportSnapshot } from "../functions/_shared/report-persistence.ts";
import {
  createJobIfAbsent,
  finishJob,
  getJob,
  updateJobLog,
} from "../functions/_shared/audit-jobs.ts";
import type { AuditJobLine } from "../../db/schema.ts";

// Interactive audits run HERE, server-side, and stream progress to the browser
// over SSE (the progress log consumes `log` events). Because the server runs the
// audit, the resulting report is authoritative by construction — no
// browser-submitted trust data, no CORS proxies. `runAudit` and its dependency
// graph are free of node: builtins, so they run in the Deno edge runtime and
// fetch npm directly.
//
// Resumable: the client-facing SSE connection is recycled by the platform (~60s),
// far shorter than a scope-heavy audit, so we can't hold one connection for the
// whole run. Each run is a durable job keyed by `jobId` (see the auditJobs table):
// the FIRST request runs the audit and persists its progress + result; a
// reconnecting request (same jobId, `from` = last line it saw) replays the stored
// log and tails until the run finishes. Reports stay complete however long the
// audit runs — no keepalive can beat a total connection cut, so we reconnect
// instead (the platform-intended SSE pattern).

const encoder = new TextEncoder();

function sse(event: string, data: unknown, id?: number): Uint8Array {
  const idLine = id === undefined ? "" : `id: ${id}\n`;
  return encoder.encode(`event: ${event}\n${idLine}data: ${JSON.stringify(data)}\n\n`);
}

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// How often a reconnecting client polls the stored log for new lines...
const TAIL_POLL_MS = 1000;
// ...and how long a running job may go without new progress before the tail
// assumes its runner died and ends with an error rather than hanging forever.
const TAIL_STALL_MS = 120_000;

type Enqueue = (chunk: Uint8Array) => void;

export default async (req: Request): Promise<Response> => {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return new Response("invalid JSON", { status: 400 });
  }

  const body = parseOrNull(AuditRequestSchema, raw);
  if (!body) return new Response("invalid audit request", { status: 400 });
  if (body.orgs.length === 0) return new Response("no orgs supplied", { status: 400 });
  const blockedOrg = body.orgs.find(isBlockedOrg);
  if (blockedOrg) {
    return new Response(blockedOrgMessage(blockedOrg), { status: 400 });
  }
  if (body.kinds.length === 0) return new Response("no reports selected", { status: 400 });
  // `external` needs a member list; mirror the client-side guard.
  if (body.kinds.includes("external") && body.members.length === 0) {
    return new Response("the external report needs an org member list", { status: 400 });
  }

  const config: AuditConfig = {
    orgs: body.orgs,
    months: body.months,
    all: body.all,
    bots: body.bots,
    jobs: FETCH_CONCURRENCY,
  };
  const { jobId, from, kinds, members } = body;

  let open = true;
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      // Guard every write: the client can disconnect mid-run (or its connection
      // is recycled), after which the controller is dead and enqueue throws.
      const enqueue: Enqueue = (chunk) => {
        if (!open) return;
        try {
          controller.enqueue(chunk);
        } catch {
          open = false;
        }
      };
      const close = () => {
        if (!open) return;
        open = false;
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      };

      try {
        // Atomic fresh-vs-resume: only the request that INSERTs the row runs the
        // audit; a reconnect (row already exists) tails it instead of starting a
        // second run.
        // The private org member list is invocation-only and must not enter job storage.
        const request = {
          orgs: config.orgs,
          kinds,
          months: config.months,
          all: config.all,
          bots: config.bots,
        };
        const isFresh = await createJobIfAbsent(jobId, request);
        if (isFresh) {
          await runFresh(jobId, config, kinds, members, enqueue);
        } else {
          await tail(jobId, from, enqueue, () => open);
        }
      } catch (error) {
        console.error(`[audit-stream] stream failed job=${jobId}:`, error);
        enqueue(sse("error", error instanceof Error ? error.message : "audit failed"));
      } finally {
        close();
      }
    },
    cancel() {
      // Client went away; stop tailing / further writes. A fresh run keeps going
      // headless so the report still saves and a reconnect can finish it.
      open = false;
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-store",
      // Disable proxy buffering so events flush immediately.
      "x-accel-buffering": "no",
    },
  });
};

// The first request for a jobId: run the audit, persisting progress as it goes so
// reconnects can catch up, then save the report and record the terminal state.
// This keeps running even if its own client disconnects — that is what lets a long
// audit finish and a reconnected client read the result.
async function runFresh(
  jobId: string,
  config: AuditConfig,
  kinds: ReportKind[],
  members: string[],
  enqueue: Enqueue,
): Promise<void> {
  const startedAt = Date.now();
  console.log(
    `[audit-stream] start job=${jobId} orgs=${config.orgs.join("+")} kinds=${kinds.join(",")} all=${config.all}`,
  );

  const logLines: AuditJobLine[] = [];
  let seq = 0;
  // Persist the log on an interval (not per line) so a single writer flushes it;
  // reconnecting clients read these rows. We await the in-flight flush before the
  // final write so a late flush can't clobber the terminal log.
  let flushing = false;
  let dirty = false;
  let flushPromise: Promise<void> = Promise.resolve();
  const flush = () => {
    if (flushing || !dirty) return;
    flushing = true;
    dirty = false;
    const snapshot = logLines.slice();
    flushPromise = updateJobLog(jobId, snapshot)
      .catch((error) => {
        dirty = true; // retry on the next tick
        console.error(`[audit-stream] log flush failed job=${jobId}:`, error);
      })
      .finally(() => {
        flushing = false;
      });
  };
  const flushTimer = setInterval(flush, TAIL_POLL_MS);

  const log = (message: string) => {
    const line: AuditJobLine = { seq: seq++, line: message };
    logLines.push(line);
    dirty = true;
    enqueue(sse("log", message, line.seq));
  };

  try {
    const result: AuditResult = await runAudit(config, kinds, members, log);

    // Persist the authoritative report; the server owns this write.
    const scope: SharedReportScope = config.all ? "all" : { months: config.months };
    let reportId: string | null = null;
    let saveError: string | null = null;
    try {
      const saved = await saveReportSnapshot({
        orgs: config.orgs,
        scope,
        scopeLabel: scopeLabelFor(scope),
        capturedAt: new Date().toISOString(),
        payload: result,
      });
      reportId = saved.id;
    } catch (error) {
      saveError = error instanceof Error ? error.message : "could not save report";
      console.error(
        `[audit-stream] save failed after ${Date.now() - startedAt}ms job=${jobId}:`,
        error,
      );
    }

    clearInterval(flushTimer);
    await flushPromise;
    // Record the terminal state so a reconnected client reads result + link from
    // the job even though it missed the live frames.
    await finishJob(jobId, { status: "done", log: logLines, result, reportId, error: saveError });

    // Also stream to a still-connected client (fast audits never disconnect).
    enqueue(sse("result", result));
    enqueue(
      sse("done", reportId ? { id: reportId, url: `/report/${reportId}` } : { error: saveError }),
    );
    console.log(
      `[audit-stream] done job=${jobId} id=${reportId ?? "(unsaved)"} in ${Date.now() - startedAt}ms`,
    );
  } catch (auditError) {
    clearInterval(flushTimer);
    await flushPromise;
    const message = auditError instanceof Error ? auditError.message : "audit failed";
    console.error(
      `[audit-stream] audit failed after ${Date.now() - startedAt}ms job=${jobId}:`,
      auditError,
    );
    await finishJob(jobId, { status: "error", log: logLines, error: message });
    enqueue(sse("error", message));
  }
}

// A reconnecting request: don't re-run the audit — replay stored log lines after
// `from`, then poll for new ones until the run reaches a terminal state, and
// forward the result/link (or error) the fresh run recorded.
async function tail(
  jobId: string,
  from: number,
  enqueue: Enqueue,
  isOpen: () => boolean,
): Promise<void> {
  console.log(`[audit-stream] resume job=${jobId} from=${from}`);
  let lastSeq = from;
  let lastProgressAt = Date.now();

  for (;;) {
    if (!isOpen()) return; // client disconnected again; a fresh run finishes headless
    const job = await getJob(jobId);
    if (!job) {
      // A cleanup sweep removed it (or it never existed). Don't hang.
      enqueue(sse("error", "audit session expired"));
      return;
    }

    const fresh = job.log.filter((line) => line.seq > lastSeq);
    for (const line of fresh) {
      enqueue(sse("log", line.line, line.seq));
      lastSeq = line.seq;
    }
    if (fresh.length > 0) lastProgressAt = Date.now();

    if (job.status === "done") {
      if (job.result != null) enqueue(sse("result", job.result));
      enqueue(
        sse(
          "done",
          job.reportId
            ? { id: job.reportId, url: `/report/${job.reportId}` }
            : { error: job.error ?? "could not save report" },
        ),
      );
      return;
    }
    if (job.status === "error") {
      enqueue(sse("error", job.error ?? "audit failed"));
      return;
    }
    if (Date.now() - lastProgressAt > TAIL_STALL_MS) {
      enqueue(sse("error", "audit stalled"));
      return;
    }
    await delay(TAIL_POLL_MS);
  }
}

export const config: Config = {
  path: "/api/audit-stream",
  method: "POST",
  // Report creation runs a full server-side audit; cap abuse while staying
  // generous for real use. Netlify enforces this at the edge before this runs.
  // NB: a long audit reconnects a few times, and each reconnect re-hits this
  // endpoint, so keep the window comfortably above those extra requests.
  rateLimit: { windowLimit: 30, windowSize: 60, aggregateBy: ["ip"] },
};
