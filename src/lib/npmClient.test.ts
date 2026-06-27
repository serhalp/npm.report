import { afterEach, describe, expect, it, vi } from "vitest";
import {
  FailureLog,
  npmGet,
  npmGetJson,
  pkgUrl,
  retryDelayMs,
  toEpoch,
  versionUrl,
} from "./npmClient";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

function textResponse(body: string, status = 200, headers?: HeadersInit) {
  return new Response(body, { status, headers });
}

describe("npm client", () => {
  it("calculates retry delays from Retry-After with bounded fallback", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-27T00:00:00.000Z"));

    expect(retryDelayMs("5", 2)).toBe(5_000);
    expect(retryDelayMs("Sat, 27 Jun 2026 00:00:03 GMT", 2)).toBe(3_000);
    expect(retryDelayMs("999", 2)).toBe(60_000);
    expect(retryDelayMs("not a date", 2)).toBe(4_000);
    expect(retryDelayMs(null, 3)).toBe(9_000);
  });

  it("proxies npm hosts and records exhausted retryable failures", async () => {
    const fetchMock = vi.fn().mockResolvedValue(textResponse("rate limited", 429));
    vi.stubGlobal("fetch", fetchMock);
    const failures = new FailureLog();
    const url = "https://registry.npmjs.org/@scope%2fpkg?write=true";

    await expect(npmGet(url, failures, 1)).resolves.toBeNull();

    expect(fetchMock).toHaveBeenCalledWith("/api/npm-registry/@scope%2fpkg?write=true", {
      headers: { Accept: "application/json" },
    });
    expect(failures.failures).toEqual([{ url, reason: "http 429" }]);
  });

  it("encodes fast-npm-meta plus separators in proxy paths", async () => {
    const fetchMock = vi.fn().mockResolvedValue(textResponse("[]"));
    vi.stubGlobal("fetch", fetchMock);

    await npmGet("https://npm.antfu.dev/@scope/pkg+left-pad?metadata=true", new FailureLog());

    expect(fetchMock).toHaveBeenCalledWith("/api/npm-meta/@scope/pkg%2Bleft-pad?metadata=true", {
      headers: { Accept: "application/json" },
    });
  });

  it("honors retry-after before retrying and does not log successful retries", async () => {
    vi.useFakeTimers();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(textResponse("temporary", 503, { "retry-after": "2" }))
      .mockResolvedValueOnce(textResponse("ok"));
    vi.stubGlobal("fetch", fetchMock);
    const failures = new FailureLog();

    const promise = npmGet("https://api.npmjs.org/downloads/point/last-week/left-pad", failures, 2);
    await vi.advanceTimersByTimeAsync(2_000);

    await expect(promise).resolves.toBe("ok");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(failures.count).toBe(0);
  });

  it("treats 404 as legitimately empty and JSON parse errors as empty", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(textResponse("missing", 404))
      .mockResolvedValueOnce(textResponse("<html>not json</html>"));
    vi.stubGlobal("fetch", fetchMock);
    const failures = new FailureLog();

    await expect(npmGet("https://registry.npmjs.org/nope", failures)).resolves.toBeNull();
    await expect(npmGetJson("https://registry.npmjs.org/nope", failures)).resolves.toBeNull();
    expect(failures.count).toBe(0);
  });

  it("formats registry URLs and ISO epochs", () => {
    expect(pkgUrl("@scope/pkg")).toBe("https://registry.npmjs.org/@scope%2fpkg");
    expect(versionUrl("@scope/pkg", "1.2.3")).toBe("https://registry.npmjs.org/@scope%2fpkg/1.2.3");
    expect(toEpoch("2026-06-27T00:00:00.000Z")).toBe(1782518400);
    expect(toEpoch("not a date")).toBeNull();
  });
});
