import { afterEach, describe, expect, it, vi } from "vitest";
import { proxyNpm } from "./npm-proxy";

afterEach(() => {
  vi.unstubAllGlobals();
});

function req(path: string, init?: RequestInit) {
  return new Request(`https://audit.example${path}`, init);
}

describe("proxyNpm", () => {
  it("only allows GET requests", async () => {
    const res = await proxyNpm(
      req("/api/npm-registry/pkg", { method: "POST" }),
      "registry.npmjs.org",
      "/api/npm-registry",
    );

    expect(res.status).toBe(405);
    await expect(res.text()).resolves.toBe("method not allowed");
  });

  it("rejects traversal, malformed encoding, and control-character paths", async () => {
    const cases = [
      "/api/npm-registry/../secret",
      "/api/npm-registry/%2e%2e/secret",
      "/api/npm-registry/%zz",
      "/api/npm-registry/has%0anewline",
      "/api/npm-registry/has%20space",
      "/api/npm-registry/has%5cbackslash",
    ];

    const statuses = await Promise.all(
      cases.map(async (path) => {
        const res = await proxyNpm(req(path), "registry.npmjs.org", "/api/npm-registry");
        return { path, status: res.status };
      }),
    );

    for (const { path, status } of statuses) {
      expect(status, path).toBe(400);
    }
  });

  it("pins the upstream host while preserving resource path and query", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: {
          "content-type": "application/json",
        },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const res = await proxyNpm(
      req("/api/npm-registry/@scope%2fpkg?metadata=true"),
      "registry.npmjs.org",
      "/api/npm-registry",
    );

    expect(fetchMock).toHaveBeenCalledWith(
      "https://registry.npmjs.org/@scope%2fpkg?metadata=true",
      {
        headers: { Accept: "application/json" },
      },
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/json");
    expect(res.headers.get("access-control-allow-origin")).toBe("*");
    expect(res.headers.get("cache-control")).toBe("public, max-age=300");
    expect(res.headers.get("netlify-cdn-cache-control")).toBe("public, durable, max-age=300");
    expect(res.headers.get("netlify-vary")).toBe("query");
    await expect(res.json()).resolves.toEqual({ ok: true });
  });

  it("preserves encoded fast-npm-meta plus separators", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("[]", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const res = await proxyNpm(
      req("/api/npm-meta/@scope/pkg%2Bleft-pad?metadata=true"),
      "npm.antfu.dev",
      "/api/npm-meta",
    );

    expect(fetchMock).toHaveBeenCalledWith(
      "https://npm.antfu.dev/@scope/pkg%2Bleft-pad?metadata=true",
      {
        headers: { Accept: "application/json" },
      },
    );
    expect(res.status).toBe(200);
  });

  it("does not cache non-2xx responses and forwards Retry-After", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response("slow down", {
          status: 429,
          headers: {
            "retry-after": "7",
          },
        }),
      ),
    );

    const res = await proxyNpm(
      req("/api/npm-downloads/downloads/point/last-week/pkg"),
      "api.npmjs.org",
      "/api/npm-downloads",
    );

    expect(res.status).toBe(429);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(res.headers.get("retry-after")).toBe("7");
    expect(res.headers.get("access-control-allow-origin")).toBe("*");
  });

  it("turns upstream network errors into retryable 502 responses", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network down")));

    const res = await proxyNpm(req("/api/npm-meta/pkg"), "npm.antfu.dev", "/api/npm-meta");

    expect(res.status).toBe(502);
    await expect(res.text()).resolves.toBe("upstream fetch failed");
  });
});
