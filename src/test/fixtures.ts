import type { AuditResult } from "../lib/runAudit";
import type { RecentReport } from "../lib/types";

export const recentReport: RecentReport = {
  summary: {
    scopeLabel: "last 12 months",
    orgs: ["netlify"],
    total: 2,
    provenance: 1,
    trustedPublisher: 1,
    stagedPublish: 0,
    deprecated: 1,
    byLevel: {
      stagedPublish: 0,
      trustedPublisher: 1,
      provenance: 0,
      none: 1,
    },
  },
  rows: [
    {
      pkg: "alpha",
      latestPublish: "2026-01-02T03:04:05.000Z",
      version: "1.0.0",
      level: "trustedPublisher",
      provenance: true,
      trustedPublisher: true,
      stagedPublish: false,
      publisher: "bot",
      deprecated: false,
      downloads: 10,
    },
    {
      pkg: "beta",
      latestPublish: "2026-02-03T04:05:06.000Z",
      version: "2.0.0",
      level: "none",
      provenance: false,
      trustedPublisher: false,
      stagedPublish: false,
      publisher: "human",
      deprecated: true,
      downloads: null,
    },
  ],
};

export const auditResult: AuditResult = {
  recent: recentReport,
  manual: {
    totalScanned: 2,
    bots: ["bot"],
    byPublisher: [{ who: "human", count: 1 }],
    rows: [{ when: "2026-02-03T04:05:06.000Z", who: "human", ref: "beta@2.0.0" }],
  },
  failures: [{ url: "https://registry.npmjs.org/beta", reason: "http 429" }],
};
