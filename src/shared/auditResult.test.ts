import { describe, expect, it } from "vitest";
import { hasAuditContent } from "./auditResult";
import type { ExternalReport, ManualReport, TrustReport } from "#shared/types";

const emptyTrust: TrustReport = {
  rows: [],
  summary: {
    scopeLabel: "ALL org packages",
    orgs: ["acme"],
    total: 0,
    provenance: 0,
    trustedPublisher: 0,
    stagedPublish: 0,
    deprecated: 0,
    byLevel: { stagedPublish: 0, trustedPublisher: 0, provenance: 0, none: 0 },
  },
};

const emptyManual: ManualReport = {
  rows: [],
  totalScanned: 0,
  bots: [],
  byPublisher: [],
};

const emptyExternal: ExternalReport = {
  rows: [],
  distinctUsers: 0,
  byUser: [],
  scanned: 0,
};

describe("hasAuditContent", () => {
  it("rejects an audit that matched no packages", () => {
    expect(hasAuditContent({ failures: [] })).toBe(false);
    expect(hasAuditContent({ trust: emptyTrust, failures: [] })).toBe(false);
    expect(hasAuditContent({ manual: emptyManual, failures: [] })).toBe(false);
    expect(hasAuditContent({ external: emptyExternal, failures: [] })).toBe(false);
  });

  it("keeps an audit with any finding or scanned package", () => {
    expect(
      hasAuditContent({
        trust: { ...emptyTrust, summary: { ...emptyTrust.summary, total: 1 } },
        failures: [],
      }),
    ).toBe(true);
    expect(hasAuditContent({ manual: { ...emptyManual, totalScanned: 1 }, failures: [] })).toBe(
      true,
    );
    expect(hasAuditContent({ external: { ...emptyExternal, scanned: 1 }, failures: [] })).toBe(
      true,
    );
  });

  it("keeps a failed audit so partial-failure warnings stay visible", () => {
    expect(
      hasAuditContent({
        trust: emptyTrust,
        failures: [{ url: "https://registry.npmjs.org/-/org/acme/package", reason: "http 500" }],
      }),
    ).toBe(true);
  });
});
