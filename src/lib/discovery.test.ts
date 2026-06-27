import { afterEach, describe, expect, it, vi } from "vitest";
import { listOrgPackages, resolveMeta } from "./discovery";
import { FailureLog } from "./npmClient";

afterEach(() => {
  vi.unstubAllGlobals();
});

function jsonResponse(body: unknown) {
  return new Response(JSON.stringify(body), { status: 200 });
}

describe("discovery", () => {
  it("lists org packages from registry responses with dedupe and sorting", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      if (String(input).endsWith("/-/org/Netlify/package")) {
        return jsonResponse({ zebra: {}, alpha: {} });
      }
      return jsonResponse({ alpha: {}, beta: {} });
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(listOrgPackages(["Netlify", "gatsby"], new FailureLog())).resolves.toEqual([
      "alpha",
      "beta",
      "zebra",
    ]);
  });

  it("resolves fast-npm-meta batches without registry fallback", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse([
        {
          name: "@scope/pkg",
          version: "1.2.3",
          publishedAt: "2026-06-27T00:00:00.000Z",
          deprecated: "",
        },
        {
          name: "left-pad",
          version: "2.0.0",
          publishedAt: "2026-06-26T00:00:00.000Z",
          deprecated: false,
        },
      ]),
    );
    vi.stubGlobal("fetch", fetchMock);
    const progress: Array<[number, number]> = [];

    const meta = await resolveMeta(["@scope/pkg", "left-pad"], new FailureLog(), (done, total) =>
      progress.push([done, total]),
    );

    expect(fetchMock).toHaveBeenCalledWith("/api/npm-meta/@scope/pkg%2Bleft-pad?metadata=true", {
      headers: { Accept: "application/json" },
    });
    expect(meta).toEqual([
      {
        name: "@scope/pkg",
        version: "1.2.3",
        publishedAt: "2026-06-27T00:00:00.000Z",
        deprecated: true,
      },
      {
        name: "left-pad",
        version: "2.0.0",
        publishedAt: "2026-06-26T00:00:00.000Z",
        deprecated: false,
      },
    ]);
    expect(progress).toEqual([[2, 2]]);
  });

  it("records incomplete discovery when fast-npm-meta returns unparseable or empty batches", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response("<html>rate limited</html>", { status: 200 }))
      .mockResolvedValueOnce(jsonResponse({ error: "too many packages" }));
    vi.stubGlobal("fetch", fetchMock);
    const failures = new FailureLog();

    await expect(resolveMeta(["first"], failures)).resolves.toEqual([]);
    await expect(resolveMeta(["second"], failures)).resolves.toEqual([]);

    expect(failures.failures).toEqual([
      {
        url: "https://npm.antfu.dev/first?metadata=true",
        reason: "unparseable fast-npm-meta response",
      },
      {
        url: "https://npm.antfu.dev/second?metadata=true",
        reason: "fast-npm-meta resolved no packages for batch",
      },
    ]);
  });
});
