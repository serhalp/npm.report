// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const runUserPublishes = vi.hoisted(() => vi.fn());

vi.mock("../../../src/lib/reports.ts", () => ({ runUserPublishes }));

import handler, { config } from "../../edge-functions/user-publishes-stream.ts";

const REPORT = {
  user: "alice",
  scanned: 1,
  rows: [{ when: "2026-08-01T00:00:00.000Z", ref: "alpha@1.0.0" }],
};

interface Frame {
  event: string;
  data: unknown;
}

function post(body: unknown): Request {
  return new Request("https://audit.example/api/user-publishes-stream", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function readFrames(response: Response): Promise<Frame[]> {
  const text = await response.text();
  return text
    .trim()
    .split("\n\n")
    .filter(Boolean)
    .map((raw) => {
      const lines = raw.split("\n");
      const event = lines
        .find((line) => line.startsWith("event:"))
        ?.slice(6)
        .trim();
      const data = lines
        .find((line) => line.startsWith("data:"))
        ?.slice(5)
        .trim();
      if (!event || !data) throw new Error(`Invalid SSE frame: ${raw}`);
      return { event, data: JSON.parse(data) };
    });
}

beforeEach(() => {
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
  runUserPublishes.mockResolvedValue(REPORT);
});

afterEach(() => vi.restoreAllMocks());

describe("user publishes edge function", () => {
  it("rejects malformed JSON", async () => {
    const response = await handler(
      new Request("https://audit.example/api/user-publishes-stream", {
        method: "POST",
        body: "{",
      }),
    );

    expect(response.status).toBe(400);
    await expect(response.text()).resolves.toBe("invalid JSON");
  });

  it.each([
    ["a missing user", { months: 12 }],
    ["a blank user", { user: "   ", months: 12 }],
    ["an invalid request shape", { user: "alice", months: "12" }],
  ])("rejects %s", async (_name, body) => {
    const response = await handler(post(body));

    expect(response.status).toBe(400);
    await expect(response.text()).resolves.toBe("an npm username is required");
    expect(runUserPublishes).not.toHaveBeenCalled();
  });

  it("streams progress, incomplete-result warnings, the result, and done", async () => {
    runUserPublishes.mockImplementation(
      async (user, months, jobs, useCachePackages, failures, log) => {
        expect({ user, months, jobs, useCachePackages }).toEqual({
          user: "alice",
          months: 6,
          jobs: 12,
          useCachePackages: ["alpha"],
        });
        log("[user] scanning publishes");
        failures.add("https://registry.npmjs.org/alpha", "http 500");
        return REPORT;
      },
    );

    const response = await handler(
      post({ user: " alice ", months: 6, useCachePackages: ["alpha"] }),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("text/event-stream; charset=utf-8");
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await readFrames(response)).toEqual([
      { event: "log", data: "[user] scanning publishes" },
      {
        event: "log",
        data: "WARNING: 1 fetch(es) failed after retries — results may be INCOMPLETE.",
      },
      { event: "result", data: REPORT },
      { event: "done", data: {} },
    ]);
  });

  it("streams a terminal lookup failure", async () => {
    runUserPublishes.mockRejectedValueOnce(new Error("npm unavailable"));

    const response = await handler(post({ user: "alice", months: 12 }));

    expect(await readFrames(response)).toEqual([{ event: "error", data: "npm unavailable" }]);
  });

  it("retains the report-creation rate limit", () => {
    expect(config).toEqual({
      path: "/api/user-publishes-stream",
      method: "POST",
      rateLimit: { windowLimit: 30, windowSize: 60, aggregateBy: ["ip"] },
    });
  });
});
