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
});
