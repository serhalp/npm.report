import { afterEach, describe, expect, it, vi } from "vitest";
import * as v from "valibot";
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

  it("fetches npm directly and records exhausted retryable failures", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(textResponse("rate limited", 429));
    vi.stubGlobal("fetch", fetchMock);
    const failures = new FailureLog();
    const url = "https://registry.npmjs.org/@scope%2fpkg?write=true";

    await expect(npmGet(url, failures, 1)).resolves.toBeNull();

    expect(fetchMock).toHaveBeenCalledWith(url, {
      headers: { Accept: "application/json" },
    });
    expect(failures.failures).toEqual([{ url, reason: "http 429" }]);
  });

  it("sends the request URL verbatim (scoped names and + separators intact)", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(textResponse("[]"));
    vi.stubGlobal("fetch", fetchMock);
    const url = "https://npm.antfu.dev/@scope/pkg+left-pad?metadata=true";

    await npmGet(url, new FailureLog());

    expect(fetchMock).toHaveBeenCalledWith(url, {
      headers: { Accept: "application/json" },
    });
  });

  it("honors retry-after before retrying and does not log successful retries", async () => {
    vi.useFakeTimers();
    const fetchMock = vi
      .fn<typeof fetch>()
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

  it("treats 404 as legitimately empty but logs a non-empty unparseable body as a failure", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(textResponse("missing", 404))
      .mockResolvedValueOnce(textResponse("<html>not json</html>"));
    vi.stubGlobal("fetch", fetchMock);
    const failures = new FailureLog();

    // 404 is a legitimately-empty result: null, nothing recorded.
    await expect(npmGet("https://registry.npmjs.org/nope", failures)).resolves.toBeNull();
    expect(failures.count).toBe(0);

    // A 200 whose body isn't JSON (e.g. an HTML rate-limit interstitial) is NOT
    // empty — it must be recorded so the UI can warn results are incomplete.
    const url = "https://registry.npmjs.org/bad";
    await expect(npmGetJson(url, failures, v.unknown())).resolves.toBeNull();
    expect(failures.failures).toEqual([{ url, reason: "unparseable JSON response" }]);
  });

  it("logs a parseable response that violates the supplied JSON schema", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(textResponse('{"downloads":"many"}'));
    vi.stubGlobal("fetch", fetchMock);
    const failures = new FailureLog();
    const url = "https://api.npmjs.org/downloads/point/last-week/left-pad";
    const downloadSchema = v.object({ downloads: v.number() });

    await expect(npmGetJson(url, failures, downloadSchema)).resolves.toBeNull();
    expect(failures.failures).toEqual([{ url, reason: "unexpected JSON response" }]);
  });

  it("formats registry URLs and ISO epochs", () => {
    expect(pkgUrl("@scope/pkg")).toBe("https://registry.npmjs.org/@scope%2fpkg");
    expect(versionUrl("@scope/pkg", "1.2.3")).toBe("https://registry.npmjs.org/@scope%2fpkg/1.2.3");
    expect(toEpoch("2026-06-27T00:00:00.000Z")).toBe(1782518400);
    expect(toEpoch("not a date")).toBeNull();
  });
});
