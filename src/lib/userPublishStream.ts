// Client side of the server-run user-publishes lookup: POST to
// /api/user-publishes-stream and consume its SSE stream (`log` → terminal,
// `result` → the UserPublishReport). Runs server-side like the main audit.
import { readSseStream } from "./sseStream.ts";
import { UserPublishReportSchema, parseOrNull } from "./schemas.ts";
import type { UserPublishReport } from "./types.ts";

export interface UserPublishStreamRequest {
  user: string;
  months: number;
  useCachePackages: string[];
}

export async function streamUserPublishes(
  request: UserPublishStreamRequest,
  onLog: (line: string) => void,
): Promise<UserPublishReport | null> {
  const response = await fetch("/api/user-publishes-stream", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(request),
  });
  if (!response.ok || !response.body) {
    throw new Error(`Lookup failed (${response.status})`);
  }

  let result: UserPublishReport | null = null;
  let fatal: string | null = null;
  await readSseStream(response.body, ({ event, data }) => {
    if (event === "log" && typeof data === "string") {
      onLog(data);
    } else if (event === "result") {
      result = parseOrNull(UserPublishReportSchema, data);
    } else if (event === "error" && typeof data === "string") {
      fatal = data;
    }
  });

  if (fatal) throw new Error(fatal);
  return result;
}
