import { afterEach, describe, expect, it, vi } from "vitest";
import downloadsProxy, {
  config as downloadsConfig,
} from "../../edge-functions/npm-downloads-proxy";
import metaProxy, { config as metaConfig } from "../../edge-functions/npm-meta-proxy";
import registryProxy, { config as registryConfig } from "../../edge-functions/npm-registry-proxy";

afterEach(() => {
  vi.unstubAllGlobals();
});

function okFetch() {
  return vi.fn().mockResolvedValue(new Response("{}", { status: 200 }));
}

describe("npm edge proxy wrappers", () => {
  it("pin each wrapper to its single upstream host", async () => {
    const fetchMock = okFetch();
    vi.stubGlobal("fetch", fetchMock);

    await registryProxy(new Request("https://audit.example/api/npm-registry/pkg"));
    await downloadsProxy(
      new Request("https://audit.example/api/npm-downloads/downloads/point/last-week/pkg"),
    );
    await metaProxy(new Request("https://audit.example/api/npm-meta/pkg+other?metadata=true"));

    expect(fetchMock).toHaveBeenNthCalledWith(1, "https://registry.npmjs.org/pkg", {
      headers: { Accept: "application/json" },
    });
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "https://api.npmjs.org/downloads/point/last-week/pkg",
      {
        headers: { Accept: "application/json" },
      },
    );
    expect(fetchMock).toHaveBeenNthCalledWith(3, "https://npm.antfu.dev/pkg+other?metadata=true", {
      headers: { Accept: "application/json" },
    });
  });

  it("declares manual-cache GET mounts for Netlify edge routing", () => {
    expect(registryConfig).toEqual({
      path: "/api/npm-registry/*",
      cache: "manual",
      method: "GET",
    });
    expect(downloadsConfig).toEqual({
      path: "/api/npm-downloads/*",
      cache: "manual",
      method: "GET",
    });
    expect(metaConfig).toEqual({
      path: "/api/npm-meta/*",
      cache: "manual",
      method: "GET",
    });
  });
});
