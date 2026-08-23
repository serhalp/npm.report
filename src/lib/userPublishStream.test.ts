import { afterEach, describe, expect, it, vi } from "vitest";
import { mockResolvedFetch } from "../test/mock";
import { streamUserPublishes } from "./userPublishStream";

const evt = (event: string, data: unknown) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;

function sseResponse(frames: string[]) {
  return {
    ok: true,
    status: 200,
    body: new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(frames.join("")));
        controller.close();
      },
    }),
  };
}

const REQUEST = { user: "alice", months: 12, useCachePackages: ["alpha"] };
const REPORT = {
  user: "alice",
  scanned: 3,
  rows: [{ when: "2026-06-01T00:00:00.000Z", ref: "alpha@1.0.0" }],
};

afterEach(() => vi.unstubAllGlobals());

describe("streamUserPublishes", () => {
  it("streams logs and returns the report", async () => {
    vi.stubGlobal(
      "fetch",
      mockResolvedFetch(
        sseResponse([evt("log", "scanning…"), evt("result", REPORT), evt("done", {})]),
      ),
    );
    const logs: string[] = [];
    const report = await streamUserPublishes(REQUEST, (line) => logs.push(line));
    expect(logs).toEqual(["scanning…"]);
    expect(report?.user).toBe("alice");
    expect(report?.rows).toHaveLength(1);
  });

  it("throws when the lookup errors", async () => {
    vi.stubGlobal("fetch", mockResolvedFetch(sseResponse([evt("error", "npm down")])));
    await expect(streamUserPublishes(REQUEST, () => {})).rejects.toThrow("npm down");
  });

  it("throws on a non-ok response", async () => {
    vi.stubGlobal("fetch", mockResolvedFetch({ ok: false, status: 500, body: null }));
    await expect(streamUserPublishes(REQUEST, () => {})).rejects.toThrow("Lookup failed (500)");
  });

  it("posts to the user-publishes endpoint with the request", async () => {
    const fetchMock = mockResolvedFetch(sseResponse([evt("result", REPORT), evt("done", {})]));
    vi.stubGlobal("fetch", fetchMock);
    await streamUserPublishes(REQUEST, () => {});
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/user-publishes-stream",
      expect.objectContaining({ method: "POST" }),
    );
    const body = fetchMock.mock.calls[0]?.[1]?.body;
    if (typeof body !== "string") throw new TypeError("Expected a string request body");
    expect(JSON.parse(body)).toMatchObject({
      user: "alice",
      useCachePackages: ["alpha"],
    });
  });
});
