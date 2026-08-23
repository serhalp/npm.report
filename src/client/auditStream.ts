/* eslint-disable no-await-in-loop -- Reconnect attempts are inherently sequential: each resumes from the last line the previous connection delivered. */
// Client side of the server-run audit: POST the request to /api/audit-stream and
// consume its SSE stream. `log` events feed the live terminal; `result` carries
// the authoritative AuditResult the server computed; `done` carries the saved
// report id/url (or a save error).
//
// The platform recycles the SSE connection (~60s) mid-audit, so this reconnects
// transparently: each run has a client-generated `jobId`, we track the last log
// line seen (`from`), and on a mid-stream disconnect we re-POST {jobId, from} to
// resume. The server keeps the audit running headless across reconnects and
// replays only newer lines, so the terminal keeps scrolling and the report stays
// complete however long the audit runs.
import { readSseStream } from "#client/sseStream";
import { AuditResultSchema, AuditStreamDoneSchema, parseOrNull } from "#shared/schemas";
import type { AuditResult, ReportKind } from "#shared/types";

export interface AuditStreamRequest {
  orgs: string[];
  kinds: ReportKind[];
  months: number;
  all: boolean;
  bots: string[];
  members: string[];
}

export interface AuditStreamOutcome {
  result: AuditResult | null;
  reportId?: string;
  reportUrl?: string;
  /** Set when the audit ran but the server-side save failed — the result is
   *  still usable, only the shareable link is missing. */
  saveError?: string;
}

// Safety cap: a normal long audit needs a handful of reconnects; this bounds a
// pathological reconnect loop. Each reconnect waits this long first.
const MAX_RECONNECTS = 30;
const RECONNECT_DELAY_MS = 1000;

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function streamAudit(
  request: AuditStreamRequest,
  onLog: (line: string) => void,
): Promise<AuditStreamOutcome> {
  const jobId = crypto.randomUUID();
  const outcome: AuditStreamOutcome = { result: null };
  let from = -1; // highest log id seen; a reconnect replays only newer lines
  let fatal: string | null = null;
  let terminal = false; // saw done/error — the run finished, stop reconnecting

  for (let attempt = 0; attempt < MAX_RECONNECTS; attempt++) {
    if (attempt > 0) await delay(RECONNECT_DELAY_MS);

    const response = await fetch("/api/audit-stream", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...request, jobId, from }),
    });
    if (!response.ok || !response.body) {
      throw new Error(`Audit failed (${response.status})`);
    }

    try {
      await readSseStream(response.body, ({ event, id, data }) => {
        if (event === "log" && typeof data === "string") {
          if (typeof id === "number") from = Math.max(from, id);
          onLog(data);
        } else if (event === "result") {
          outcome.result = parseOrNull(AuditResultSchema, data);
        } else if (event === "done") {
          const info = parseOrNull(AuditStreamDoneSchema, data);
          if (info?.id) {
            outcome.reportId = info.id;
            outcome.reportUrl = info.url;
          } else if (info?.error) {
            outcome.saveError = info.error;
          }
          terminal = true;
        } else if (event === "error" && typeof data === "string") {
          fatal = data;
          terminal = true;
        }
      });
    } catch {
      // Connection dropped mid-stream (the ~60s recycle, flaky network, ...). If
      // we haven't seen a terminal event, the loop reconnects and resumes.
    }
    if (terminal) break;
  }

  if (fatal) throw new Error(fatal);
  if (!terminal) throw new Error("Lost connection to the audit stream");
  return outcome;
}
