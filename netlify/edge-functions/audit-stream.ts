import type { Config } from "@netlify/edge-functions";
import { FETCH_CONCURRENCY, isBlockedOrg } from "../../src/lib/auditDefaults.ts";
import { scopeLabelFor, type SharedReportScope } from "../../src/lib/reportHistory.ts";
import { AuditRequestSchema, parseOrNull } from "../../src/lib/schemas.ts";
import { type AuditResult, runAudit } from "../../src/lib/runAudit.ts";
import type { AuditConfig } from "../../src/lib/types.ts";
import { saveReportSnapshot } from "../functions/_shared/report-persistence.ts";

// Interactive audits run HERE, server-side, and stream progress to the browser
// over SSE (the progress log consumes `log` events). Because the server
// runs the audit, the resulting report is authoritative by construction — no
// browser-submitted trust data, no CORS proxies. `runAudit` and its dependency
// graph are free of node: builtins, so they run in the Deno edge runtime and
// fetch npm directly.

const encoder = new TextEncoder();

function sse(event: string, data: unknown): Uint8Array {
  return encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

// A scope-heavy audit can run for minutes (scoped-download lookups are paced +
// rate-limited), and the progress log can go quiet for long stretches. Send an
// SSE keepalive comment on this interval so the connection never sits idle long
// enough for the platform/proxy to cut it — that idle cut is what killed the
// stream mid-audit. The comment is ignored by the client parser (no
// `event:`/`data:` line), so reports stay complete however long they take.
const KEEPALIVE_MS = 15_000;
const KEEPALIVE = encoder.encode(": keepalive\n\n");

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
    return new Response(`the '${blockedOrg}' org is too large to audit`, { status: 400 });
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

  // Server-side breadcrumbs (Netlify function logs). The SSE `log` events go to
  // the browser, not the console, so without these a failure — or a platform
  // termination mid-stream — leaves nothing to find. A `start` with no matching
  // `done`/`error` line means the function was killed (e.g. hit an edge limit).
  const startedAt = Date.now();
  console.log(
    `[audit-stream] start orgs=${config.orgs.join("+")} kinds=${body.kinds.join(",")} all=${config.all}`,
  );

  // Guard every write: the client can disconnect mid-audit, after which the
  // stream controller is dead and enqueue() throws. `open` + the try/catch keep a
  // late write (or the keepalive) from crashing the still-running audit.
  let open = true;
  let keepaliveTimer: ReturnType<typeof setInterval> | undefined;
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const enqueue = (chunk: Uint8Array) => {
        if (!open) return;
        try {
          controller.enqueue(chunk);
        } catch {
          open = false;
        }
      };
      const send = (event: string, data: unknown) => enqueue(sse(event, data));
      const log = (message: string) => send("log", message);
      // Heartbeat so a slow, quiet phase can't trip the idle-connection timeout.
      keepaliveTimer = setInterval(enqueue, KEEPALIVE_MS, KEEPALIVE);
      try {
        const result: AuditResult = await runAudit(config, body.kinds, body.members, log);
        // Stream the result immediately so the browser renders without waiting
        // on the save.
        send("result", result);

        // Persist server-side: the report is authoritative, so the server owns
        // the write (no browser POST of trusted data).
        const scope: SharedReportScope = config.all ? "all" : { months: config.months };
        try {
          const saved = await saveReportSnapshot({
            orgs: config.orgs,
            scope,
            scopeLabel: scopeLabelFor(scope),
            capturedAt: new Date().toISOString(),
            payload: result,
          });
          send("done", { id: saved.id, url: `/report/${saved.id}` });
          console.log(`[audit-stream] done id=${saved.id} in ${Date.now() - startedAt}ms`);
        } catch (saveError) {
          // The result already streamed; report the save failure separately.
          console.error(`[audit-stream] save failed after ${Date.now() - startedAt}ms:`, saveError);
          send("done", {
            error: saveError instanceof Error ? saveError.message : "could not save report",
          });
        }
      } catch (auditError) {
        console.error(`[audit-stream] audit failed after ${Date.now() - startedAt}ms:`, auditError);
        send("error", auditError instanceof Error ? auditError.message : "audit failed");
      } finally {
        clearInterval(keepaliveTimer);
        if (open) {
          try {
            controller.close();
          } catch {
            open = false;
          }
        }
      }
    },
    cancel() {
      // Client went away; stop the heartbeat and further writes.
      open = false;
      clearInterval(keepaliveTimer);
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

export const config: Config = {
  path: "/api/audit-stream",
  method: "POST",
  // Report creation runs a full server-side audit; cap abuse while staying
  // generous for real use (an audit takes seconds+, so 30/min/IP is well above
  // any human's rate). Netlify enforces this at the edge before this runs.
  rateLimit: { windowLimit: 30, windowSize: 60, aggregateBy: ["ip"] },
};
