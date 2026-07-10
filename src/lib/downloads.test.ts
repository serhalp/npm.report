import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchWeeklyDownloads } from "./downloads";
import { FailureLog } from "./npmClient";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

function jsonResponse(body: unknown) {
  return new Response(JSON.stringify(body), { status: 200 });
}

describe("fetchWeeklyDownloads", () => {
  it("uses bulk unscoped downloads and paced sequential scoped downloads", async () => {
    vi.useFakeTimers();
    const seen: string[] = [];
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      seen.push(url);
      if (url.endsWith("/left-pad,is-number")) {
        return jsonResponse({
          "left-pad": { downloads: 10 },
          "is-number": { downloads: 20 },
        });
      }
      if (url.endsWith("/@scope/pkg")) {
        return jsonResponse({ downloads: 3 });
      }
      return new Response("unexpected", { status: 500 });
    });
    vi.stubGlobal("fetch", fetchMock);
    const progress: Array<[number, number]> = [];

    const promise = fetchWeeklyDownloads(
      ["left-pad", "@scope/pkg", "is-number"],
      new FailureLog(),
      (done, total) => progress.push([done, total]),
    );
    await vi.runAllTimersAsync();
    const downloads = await promise;

    expect(seen).toEqual([
      "https://api.npmjs.org/downloads/point/last-week/left-pad,is-number",
      "https://api.npmjs.org/downloads/point/last-week/@scope/pkg",
    ]);
    expect([...downloads.entries()].toSorted()).toEqual([
      ["@scope/pkg", 3],
      ["is-number", 20],
      ["left-pad", 10],
    ]);
    expect(progress).toEqual([
      [2, 3],
      [3, 3],
    ]);
  });

  it("batches unscoped in one bulk request, paces scoped 500ms apart, and treats null as 0", async () => {
    vi.useFakeTimers();
    const seen: string[] = [];
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      seen.push(url);
      if (url.includes("/a,b")) return jsonResponse({ a: { downloads: 5 }, b: null });
      if (url.endsWith("/@s/one")) return jsonResponse({ downloads: 1 });
      if (url.endsWith("/@s/two")) return jsonResponse({ downloads: null });
      return new Response("unexpected", { status: 500 });
    });
    vi.stubGlobal("fetch", fetchMock);

    const promise = fetchWeeklyDownloads(["a", "@s/one", "b", "@s/two"], new FailureLog());

    // Unscoped 'a' and 'b' go out together in one comma-joined bulk request, then
    // the first scoped request; the second scoped is gated behind a 500ms delay.
    await vi.advanceTimersByTimeAsync(0);
    expect(seen).toEqual([
      "https://api.npmjs.org/downloads/point/last-week/a,b",
      "https://api.npmjs.org/downloads/point/last-week/@s/one",
    ]);
    await vi.advanceTimersByTimeAsync(499);
    expect(seen).toHaveLength(2);
    await vi.advanceTimersByTimeAsync(1);
    expect(seen[2]).toBe("https://api.npmjs.org/downloads/point/last-week/@s/two");

    await vi.runAllTimersAsync();
    const downloads = await promise;
    expect(downloads.get("a")).toBe(5);
    expect(downloads.get("b")).toBe(0); // present-but-null bulk entry -> 0
    expect(downloads.get("@s/one")).toBe(1);
    expect(downloads.get("@s/two")).toBe(0); // present-but-null scoped response -> 0
  });
});
