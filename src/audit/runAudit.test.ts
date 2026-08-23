import { beforeEach, describe, expect, it, vi } from "vitest";
import { runAudit } from "./runAudit";
import { discoverInScope, runExternal, runManual, runTrust } from "./reports";
import type { AuditConfig, PkgMeta } from "#shared/types";

vi.mock("./reports", () => ({
  discoverInScope: vi.fn<typeof import("./reports").discoverInScope>(),
  runExternal: vi.fn<typeof import("./reports").runExternal>(),
  runManual: vi.fn<typeof import("./reports").runManual>(),
  runTrust: vi.fn<typeof import("./reports").runTrust>(),
}));

const config: AuditConfig = {
  orgs: ["acme"],
  months: 3,
  all: false,
  bots: [],
  jobs: 2,
};

const scope: PkgMeta[] = [
  {
    name: "pkg",
    version: "1.0.0",
    publishedAt: "2026-06-01T00:00:00.000Z",
    deprecated: false,
  },
];

beforeEach(() => {
  vi.mocked(discoverInScope).mockResolvedValue(scope);
  vi.mocked(runTrust).mockResolvedValue({
    rows: [],
    summary: {
      scopeLabel: "last 3 months",
      orgs: ["acme"],
      total: 0,
      provenance: 0,
      trustedPublisher: 0,
      stagedPublish: 0,
      deprecated: 0,
      byLevel: {
        stagedPublish: 0,
        trustedPublisher: 0,
        provenance: 0,
        none: 0,
      },
    },
  });
  vi.mocked(runManual).mockResolvedValue({
    rows: [],
    totalScanned: 0,
    bots: [],
    byPublisher: [],
  });
  vi.mocked(runExternal).mockResolvedValue({
    rows: [],
    distinctUsers: 0,
    byUser: [],
  });
});

describe("runAudit", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shares discovery for trust/manual and skips external without members", async () => {
    const log = vi.fn<(message: string) => void>();

    const result = await runAudit(config, ["trust", "manual", "external"], [], log);

    expect(discoverInScope).toHaveBeenCalledTimes(1);
    expect(runTrust).toHaveBeenCalledWith(config, expect.anything(), log, scope);
    expect(runManual).toHaveBeenCalledWith(config, ["pkg"], expect.anything(), log);
    expect(runExternal).not.toHaveBeenCalled();
    expect(result).toHaveProperty("trust");
    expect(result).toHaveProperty("manual");
    expect(result).not.toHaveProperty("external");
    expect(log).toHaveBeenCalledWith(
      "[external] SKIPPED: no org members supplied (membership isn't public)",
    );
    expect(log).toHaveBeenLastCalledWith("Done.");
  });

  it("runs external-only audits without trust/manual discovery", async () => {
    const log = vi.fn<(message: string) => void>();

    const result = await runAudit(config, ["external"], ["alice"], log);

    expect(discoverInScope).not.toHaveBeenCalled();
    expect(runTrust).not.toHaveBeenCalled();
    expect(runManual).not.toHaveBeenCalled();
    expect(runExternal).toHaveBeenCalledWith(config, ["alice"], expect.anything(), log);
    expect(result).toHaveProperty("external");
  });

  it("logs incomplete-results warnings when report builders record failures", async () => {
    vi.mocked(runExternal).mockImplementationOnce(async (_config, _members, failures) => {
      failures.add("https://registry.npmjs.org/pkg", "http 500");
      return { rows: [], distinctUsers: 0, byUser: [] };
    });
    const log = vi.fn<(message: string) => void>();

    const result = await runAudit(config, ["external"], ["alice"], log);

    expect(result.failures).toEqual([
      { url: "https://registry.npmjs.org/pkg", reason: "http 500" },
    ]);
    expect(log).toHaveBeenCalledWith(
      "WARNING: 1 fetch(es) failed after retries — results may be INCOMPLETE.",
    );
  });
});
