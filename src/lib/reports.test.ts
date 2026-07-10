import { afterEach, describe, expect, it, vi } from "vitest";
import { FailureLog } from "./npmClient";
import { discoverInScope, runExternal, runManual, runRecent, runUserPublishes } from "./reports";
import type { AuditConfig } from "./types";

const config: AuditConfig = {
  orgs: ["acme"],
  months: 6,
  all: false,
  bots: ["bot"],
  jobs: 2,
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

function jsonResponse(body: unknown) {
  return new Response(JSON.stringify(body), { status: 200 });
}

function installRoutes(routes: Record<string, unknown>) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const key = String(input);
      if (!(key in routes)) return new Response(`missing route: ${key}`, { status: 500 });
      return jsonResponse(routes[key]);
    }),
  );
}

describe("report builders", () => {
  it("discovers a recency-filtered scope and drops blank versions", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-27T00:00:00.000Z"));
    installRoutes({
      "https://registry.npmjs.org/-/org/acme/package": { recent: {}, old: {}, blank: {} },
      "https://npm.antfu.dev/blank+old+recent?metadata=true": [
        {
          name: "recent",
          version: "1.0.0",
          publishedAt: "2026-06-01T00:00:00.000Z",
          deprecated: false,
        },
        {
          name: "old",
          version: "1.0.0",
          publishedAt: "2025-01-01T00:00:00.000Z",
          deprecated: false,
        },
        {
          name: "blank",
          version: "",
          publishedAt: "2026-06-01T00:00:00.000Z",
          deprecated: false,
        },
      ],
    });
    const log = vi.fn();

    await expect(discoverInScope(config, new FailureLog(), log)).resolves.toEqual([
      {
        name: "recent",
        version: "1.0.0",
        publishedAt: "2026-06-01T00:00:00.000Z",
        deprecated: false,
      },
    ]);
    expect(log).toHaveBeenCalledWith("[recent] in scope (last 6 months): 1 packages");
  });

  it("discovers all versioned packages when all-packages mode is enabled", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-27T00:00:00.000Z"));
    installRoutes({
      "https://registry.npmjs.org/-/org/acme/package": { recent: {}, old: {}, blank: {} },
      "https://npm.antfu.dev/blank+old+recent?metadata=true": [
        {
          name: "recent",
          version: "1.0.0",
          publishedAt: "2026-06-01T00:00:00.000Z",
          deprecated: false,
        },
        {
          name: "old",
          version: "1.0.0",
          publishedAt: "2025-01-01T00:00:00.000Z",
          deprecated: false,
        },
        {
          name: "blank",
          version: "",
          publishedAt: "2026-06-01T00:00:00.000Z",
          deprecated: false,
        },
      ],
    });
    const log = vi.fn();

    await expect(discoverInScope({ ...config, all: true }, new FailureLog(), log)).resolves.toEqual(
      [
        {
          name: "recent",
          version: "1.0.0",
          publishedAt: "2026-06-01T00:00:00.000Z",
          deprecated: false,
        },
        {
          name: "old",
          version: "1.0.0",
          publishedAt: "2025-01-01T00:00:00.000Z",
          deprecated: false,
        },
      ],
    );
    expect(log).toHaveBeenCalledWith("[recent] in scope (ALL org packages): 2 packages");
  });

  it("builds recent trust/download rows and summary from a supplied discovery scope", async () => {
    vi.useFakeTimers();
    installRoutes({
      "https://registry.npmjs.org/pkg/1.0.0": {
        _npmUser: { name: "alice" },
        dist: { attestations: { provenance: true } },
      },
      "https://registry.npmjs.org/@scope%2fpkg/2.0.0": {
        _npmUser: { name: "GitHub Actions", trustedPublisher: true },
        dist: { attestations: { provenance: true } },
      },
      "https://api.npmjs.org/downloads/point/last-week/pkg": {
        package: "pkg",
        downloads: 10,
      },
      "https://api.npmjs.org/downloads/point/last-week/@scope/pkg": {
        downloads: 2,
      },
    });
    const failures = new FailureLog();
    const log = vi.fn();

    const promise = runRecent(config, failures, log, [
      {
        name: "pkg",
        version: "1.0.0",
        publishedAt: "2026-05-01T00:00:00.000Z",
        deprecated: false,
      },
      {
        name: "@scope/pkg",
        version: "2.0.0",
        publishedAt: "2026-06-01T00:00:00.000Z",
        deprecated: true,
      },
    ]);
    await vi.runAllTimersAsync();
    const report = await promise;

    expect(report.rows).toEqual([
      {
        pkg: "@scope/pkg",
        latestPublish: "2026-06-01T00:00:00.000Z",
        version: "2.0.0",
        level: "trustedPublisher",
        provenance: true,
        trustedPublisher: true,
        stagedPublish: false,
        publisher: "GitHub Actions",
        deprecated: true,
        downloads: 2,
      },
      {
        pkg: "pkg",
        latestPublish: "2026-05-01T00:00:00.000Z",
        version: "1.0.0",
        level: "provenance",
        provenance: true,
        trustedPublisher: false,
        stagedPublish: false,
        publisher: "alice",
        deprecated: false,
        downloads: 10,
      },
    ]);
    expect(report.summary).toEqual({
      scopeLabel: "last 6 months",
      orgs: ["acme"],
      total: 2,
      provenance: 2,
      trustedPublisher: 1,
      stagedPublish: 0,
      deprecated: 1,
      byLevel: {
        stagedPublish: 0,
        trustedPublisher: 1,
        provenance: 1,
        none: 0,
      },
    });
    expect(failures.count).toBe(0);
    expect(log).toHaveBeenCalledWith("[recent] fetching weekly downloads (1 scoped)...");
  });

  it("filters manual publishes by cutoff and configured bots", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-27T00:00:00.000Z"));
    installRoutes({
      "https://registry.npmjs.org/pkg": {
        name: "pkg",
        versions: {
          "1.0.0": { _npmUser: { name: "alice" } },
          "1.1.0": { _npmUser: { name: "bot" } },
          "0.9.0": { _npmUser: { name: "bob" } },
        },
        time: {
          "1.0.0": "2026-05-01T00:00:00.000Z",
          "1.1.0": "2026-04-01T00:00:00.000Z",
          "0.9.0": "2025-01-01T00:00:00.000Z",
        },
      },
    });

    const report = await runManual(config, ["pkg"], new FailureLog(), vi.fn());

    expect(report.totalScanned).toBe(2);
    expect(report.rows).toEqual([
      {
        when: "2026-05-01T00:00:00.000Z",
        who: "alice",
        ref: "pkg@1.0.0",
      },
    ]);
    expect(report.byPublisher).toEqual([{ who: "alice", count: 1 }]);
  });

  it("reports current maintainers outside the supplied org member list", async () => {
    installRoutes({
      "https://registry.npmjs.org/-/org/acme/package": { pkg: {}, other: {} },
      "https://registry.npmjs.org/pkg": {
        name: "pkg",
        maintainers: [{ name: "Alice" }, { name: "mallory" }],
      },
      "https://registry.npmjs.org/other": {
        name: "other",
        maintainers: [{ name: "mallory" }],
      },
    });

    const report = await runExternal(config, ["alice"], new FailureLog(), vi.fn());

    expect(report.rows).toEqual([
      { user: "mallory", pkg: "other" },
      { user: "mallory", pkg: "pkg" },
    ]);
    expect(report.distinctUsers).toBe(1);
    expect(report.byUser).toEqual([{ user: "mallory", count: 2 }]);
  });

  it("scans the union of user packages and extra cache packages for exact user publishes", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-27T00:00:00.000Z"));
    installRoutes({
      "https://registry.npmjs.org/-/user/alice/package": { mine: {} },
      "https://registry.npmjs.org/mine": {
        name: "mine",
        versions: {
          "1.0.0": { _npmUser: { name: "alice" } },
        },
        time: {
          "1.0.0": "2026-06-01T00:00:00.000Z",
        },
      },
      "https://registry.npmjs.org/extra": {
        name: "extra",
        versions: {
          "2.0.0": { _npmUser: { name: "alice" } },
          "2.1.0": { _npmUser: { name: "Alice" } },
        },
        time: {
          "2.0.0": "2026-05-15T00:00:00.000Z",
          "2.1.0": "2026-05-20T00:00:00.000Z",
        },
      },
    });

    const report = await runUserPublishes(
      "alice",
      6,
      2,
      ["extra", "mine"],
      new FailureLog(),
      vi.fn(),
    );

    expect(report.scanned).toBe(2);
    expect(report.rows).toEqual([
      { when: "2026-06-01T00:00:00.000Z", ref: "mine@1.0.0" },
      { when: "2026-05-15T00:00:00.000Z", ref: "extra@2.0.0" },
    ]);
  });
});
