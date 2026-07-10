// Client side of the server-run audit: POST the request to /api/audit-stream and
// consume its SSE stream. `log` events feed the live terminal; `result` carries
// the authoritative AuditResult the server computed; `done` carries the saved
// report id/url (or a save error). The browser no longer runs the audit itself.
import { readSseStream } from "./sseStream";
import { AuditResultSchema, parseOrNull } from "./schemas";
import type { AuditResult } from "./runAudit";
import type { ReportKind } from "./types";

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

export async function streamAudit(
  request: AuditStreamRequest,
  onLog: (line: string) => void,
): Promise<AuditStreamOutcome> {
  const response = await fetch("/api/audit-stream", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(request),
  });
  if (!response.ok || !response.body) {
    throw new Error(`Audit failed (${response.status})`);
  }

  const outcome: AuditStreamOutcome = { result: null };
  let fatal: string | null = null;
  await readSseStream(response.body, ({ event, data }) => {
    if (event === "log" && typeof data === "string") {
      onLog(data);
    } else if (event === "result") {
      outcome.result = parseOrNull(AuditResultSchema, data) as AuditResult | null;
    } else if (event === "done" && data && typeof data === "object") {
      const info = data as { id?: string; url?: string; error?: string };
      if (info.id) {
        outcome.reportId = info.id;
        outcome.reportUrl = info.url;
      } else if (info.error) {
        outcome.saveError = info.error;
      }
    } else if (event === "error" && typeof data === "string") {
      fatal = data;
    }
  });

  if (fatal) throw new Error(fatal);
  return outcome;
}
