import type { Config } from "@netlify/edge-functions";
import { FETCH_CONCURRENCY } from "../../src/lib/auditDefaults.ts";
import { FailureLog } from "../../src/lib/npmClient.ts";
import { runUserPublishes } from "../../src/lib/reports.ts";
import { UserPublishRequestSchema, parseOrNull } from "../../src/lib/schemas.ts";

// Per-user publish history, run server-side and streamed over SSE — same shape
// as audit-stream. Runs in the Deno edge runtime; `npmClient` fetches npm
// directly (no browser proxies).

const encoder = new TextEncoder();

function sse(event: string, data: unknown): Uint8Array {
  return encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

export default async (req: Request): Promise<Response> => {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return new Response("invalid JSON", { status: 400 });
  }

  const body = parseOrNull(UserPublishRequestSchema, raw);
  const user = body?.user.trim();
  if (!body || !user) return new Response("an npm username is required", { status: 400 });

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const log = (message: string) => controller.enqueue(sse("log", message));
      try {
        const failures = new FailureLog();
        const report = await runUserPublishes(
          user,
          body.months,
          FETCH_CONCURRENCY,
          body.useCachePackages,
          failures,
          log,
        );
        if (failures.count > 0) {
          log(
            `WARNING: ${failures.count} fetch(es) failed after retries — results may be INCOMPLETE.`,
          );
        }
        controller.enqueue(sse("result", report));
        controller.enqueue(sse("done", {}));
      } catch (error) {
        controller.enqueue(sse("error", error instanceof Error ? error.message : "lookup failed"));
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-store",
      "x-accel-buffering": "no",
    },
  });
};

export const config: Config = { path: "/api/user-publishes-stream", method: "POST" };
