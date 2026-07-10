import { afterEach, describe, expect, it, vi } from "vitest";
import { streamAudit } from "./auditStream";

const evt = (event: string, data: unknown) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;

function sseResponse(frames: string[], { chunkBytes = false } = {}) {
  const text = frames.join("");
  return {
    ok: true,
    status: 200,
    body: new ReadableStream<Uint8Array>({
      start(controller) {
        const bytes = new TextEncoder().encode(text);
        if (chunkBytes) {
          // Emit one byte at a time to prove frame reassembly across chunk boundaries.
          for (const b of bytes) controller.enqueue(new Uint8Array([b]));
        } else {
          controller.enqueue(bytes);
        }
        controller.close();
      },
    }),
  };
}

const REQUEST = {
  orgs: ["netlify"],
  kinds: ["recent"] as const,
  months: 12,
  all: true,
  bots: [],
  members: [],
};

const RESULT = {
  failures: [],
  recent: {
    rows: [],
    summary: {
      scopeLabel: "ALL org packages",
      orgs: ["netlify"],
      total: 0,
      provenance: 0,
      trustedPublisher: 0,
      stagedPublish: 0,
      deprecated: 0,
      byLevel: { stagedPublish: 0, trustedPublisher: 0, provenance: 0, none: 0 },
    },
  },
};

afterEach(() => vi.unstubAllGlobals());

describe("streamAudit", () => {
  it("streams log lines and returns the result + saved report link", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        sseResponse([
          evt("log", "[recent] listing packages"),
          evt("log", "Done."),
          evt("result", RESULT),
          evt("done", {
            id: "netlify-2026-07-09-abc12345",
            url: "/report/netlify-2026-07-09-abc12345",
          }),
        ]),
      ),
    );
    const logs: string[] = [];
    const outcome = await streamAudit(REQUEST, (line) => logs.push(line));

    expect(logs).toEqual(["[recent] listing packages", "Done."]);
    expect(outcome.result?.recent?.summary.total).toBe(0);
    expect(outcome.reportId).toBe("netlify-2026-07-09-abc12345");
    expect(outcome.reportUrl).toBe("/report/netlify-2026-07-09-abc12345");
    expect(outcome.saveError).toBeUndefined();
  });

  it("reassembles frames split across stream chunks", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        sseResponse(
          [evt("log", "chunky"), evt("result", RESULT), evt("done", { id: "x", url: "/report/x" })],
          {
            chunkBytes: true,
          },
        ),
      ),
    );
    const logs: string[] = [];
    const outcome = await streamAudit(REQUEST, (line) => logs.push(line));
    expect(logs).toEqual(["chunky"]);
    expect(outcome.reportId).toBe("x");
  });

  it("surfaces a save failure via saveError instead of throwing", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          sseResponse([evt("result", RESULT), evt("done", { error: "db unavailable" })]),
        ),
    );
    const outcome = await streamAudit(REQUEST, () => {});
    expect(outcome.result).not.toBeNull();
    expect(outcome.saveError).toBe("db unavailable");
    expect(outcome.reportId).toBeUndefined();
  });

  it("throws when the audit itself errors", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(sseResponse([evt("error", "upstream exploded")])),
    );
    await expect(streamAudit(REQUEST, () => {})).rejects.toThrow("upstream exploded");
  });

  it("throws on a non-ok response", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 429, body: null }));
    await expect(streamAudit(REQUEST, () => {})).rejects.toThrow("Audit failed (429)");
  });

  it("posts the request to the audit-stream endpoint", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        sseResponse([evt("result", RESULT), evt("done", { id: "x", url: "/report/x" })]),
      );
    vi.stubGlobal("fetch", fetchMock);
    await streamAudit(REQUEST, () => {});
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/audit-stream",
      expect.objectContaining({ method: "POST" }),
    );
    const body = JSON.parse(String(fetchMock.mock.calls[0][1].body));
    expect(body).toMatchObject({ orgs: ["netlify"], kinds: ["recent"], all: true });
  });
});
