// @vitest-environment node
import type { DatabaseConnection } from "@netlify/database";
import type { NetlifyDB } from "@netlify/database-dev";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { serializeJson } from "#db/schema";
import { resetTestDatabase, startTestDatabase, stopTestDatabase } from "../database.js";

interface StoredReport {
  id: string;
  orgs: string;
  scopeLabel: string;
  payload: unknown;
  createdAt?: Date;
}

interface StoredTrustHistory {
  reportId: string;
  orgKey: string;
  orgs: string[];
  capturedAt: Date;
  total: number;
  stagedPublish: number;
  trustedPublisher: number;
  provenance: number;
  none: number;
  deprecated: number;
  failureCount: number;
}

let database: DatabaseConnection;
let local: NetlifyDB;
let handler: typeof import("../../functions/reports.js").default;
let config: typeof import("../../functions/reports.js").config;

async function insertReport(row: StoredReport): Promise<void> {
  await database.sql`
    INSERT INTO reports (id, orgs, scope_label, payload, created_at)
    VALUES (
      ${row.id},
      ${row.orgs},
      ${row.scopeLabel},
      ${serializeJson(row.payload)}::jsonb,
      ${row.createdAt ?? new Date("2026-06-27T12:00:00.000Z")}
    )
    ON CONFLICT (id) DO NOTHING
  `;
}

async function insertHistory(row: StoredTrustHistory): Promise<void> {
  await insertReport({
    id: row.reportId,
    orgs: row.orgs.join(", "),
    scopeLabel: "ALL org packages",
    payload: { failures: [] },
    createdAt: row.capturedAt,
  });
  await database.sql`
    INSERT INTO report_trust_history (
      report_id,
      org_key,
      orgs_json,
      captured_at,
      total,
      staged_publish,
      trusted_publisher,
      provenance,
      none,
      deprecated,
      failure_count
    ) VALUES (
      ${row.reportId},
      ${row.orgKey},
      ${serializeJson(row.orgs)}::jsonb,
      ${row.capturedAt},
      ${row.total},
      ${row.stagedPublish},
      ${row.trustedPublisher},
      ${row.provenance},
      ${row.none},
      ${row.deprecated},
      ${row.failureCount}
    )
  `;
}

function makeHistory(
  reportId: string,
  orgKey: string,
  orgs: string[],
  capturedAt: string,
): StoredTrustHistory {
  return {
    reportId,
    orgKey,
    orgs,
    capturedAt: new Date(capturedAt),
    total: 4,
    stagedPublish: 0,
    trustedPublisher: 2,
    provenance: 1,
    none: 1,
    deprecated: 0,
    failureCount: 0,
  };
}

beforeAll(async () => {
  const started = await startTestDatabase();
  local = started.local;
  vi.stubEnv("NETLIFY_DB_URL", started.connectionString);
  vi.stubEnv("NETLIFY_DB_DRIVER", "server");
  vi.resetModules();
  database = (await import("#db/index")).getDb();
  const reports = await import("../../functions/reports.js");
  handler = reports.default;
  config = reports.config;
});

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-06-27T12:00:00.000Z"));
  await resetTestDatabase(database);
});

afterEach(() => vi.useRealTimers());

afterAll(async () => {
  await stopTestDatabase(local, database);
  vi.unstubAllEnvs();
});

describe("reports function", () => {
  it("serves public trust history by exact normalized org set without payloads", async () => {
    const alpha = {
      ...makeHistory(
        "netlify-gatsby-2026-06-26-aaaaaaaa",
        "gatsbyjs,netlify",
        ["gatsbyjs", "netlify"],
        "2026-06-26T10:00:00.000Z",
      ),
      trustedPublisher: 1,
      none: 2,
    };
    const beta = {
      ...makeHistory(
        "netlify-gatsby-2026-06-27-bbbbbbbb",
        "gatsbyjs,netlify",
        ["gatsbyjs", "netlify"],
        "2026-06-27T10:00:00.000Z",
      ),
      failureCount: 1,
    };
    await insertHistory(beta);
    await insertHistory(
      makeHistory(
        "netlify-2026-06-27-cccccccc",
        "netlify",
        ["netlify"],
        "2026-06-27T10:00:00.000Z",
      ),
    );
    await insertHistory(alpha);

    const response = await handler(
      new Request("https://audit.example/api/reports/history?org=Netlify&org=gatsbyjs"),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      orgs: ["gatsbyjs", "netlify"],
      points: [
        {
          id: alpha.reportId,
          url: `/report/${alpha.reportId}`,
          capturedAt: "2026-06-26T10:00:00.000Z",
          total: 4,
          byLevel: { stagedPublish: 0, trustedPublisher: 1, provenance: 1, none: 2 },
          deprecated: 0,
          failureCount: 0,
        },
        {
          id: beta.reportId,
          url: `/report/${beta.reportId}`,
          capturedAt: "2026-06-27T10:00:00.000Z",
          total: 4,
          byLevel: { stagedPublish: 0, trustedPublisher: 2, provenance: 1, none: 1 },
          deprecated: 0,
          failureCount: 1,
        },
      ],
    });
  });

  it("serves recent trust report links deduped by org set", async () => {
    const history = [
      makeHistory("netlify-older", "netlify", ["netlify"], "2026-06-20T10:00:00.000Z"),
      makeHistory("netlify-newer", "netlify", ["netlify"], "2026-06-27T10:00:00.000Z"),
      makeHistory("gatsby", "gatsbyjs", ["gatsbyjs"], "2026-06-26T10:00:00.000Z"),
      makeHistory("vite", "vite", ["vite"], "2026-06-25T10:00:00.000Z"),
      makeHistory("svelte", "svelte", ["svelte"], "2026-06-24T10:00:00.000Z"),
      makeHistory("rollup", "rollup", ["rollup"], "2026-06-23T10:00:00.000Z"),
      makeHistory("react", "react", ["react"], "2026-06-22T10:00:00.000Z"),
    ];
    await Promise.all(history.map(insertHistory));

    const response = await handler(new Request("https://audit.example/api/reports/recent"));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      reports: [
        {
          id: "netlify-newer",
          url: "/report/netlify-newer",
          orgs: ["netlify"],
          capturedAt: "2026-06-27T10:00:00.000Z",
        },
        {
          id: "gatsby",
          url: "/report/gatsby",
          orgs: ["gatsbyjs"],
          capturedAt: "2026-06-26T10:00:00.000Z",
        },
        {
          id: "vite",
          url: "/report/vite",
          orgs: ["vite"],
          capturedAt: "2026-06-25T10:00:00.000Z",
        },
        {
          id: "svelte",
          url: "/report/svelte",
          orgs: ["svelte"],
          capturedAt: "2026-06-24T10:00:00.000Z",
        },
        {
          id: "rollup",
          url: "/report/rollup",
          orgs: ["rollup"],
          capturedAt: "2026-06-23T10:00:00.000Z",
        },
      ],
    });
  });

  it("resolves a normalized org set to its latest package-trust report", async () => {
    const older = makeHistory(
      "gatsby-netlify-older",
      "gatsbyjs,netlify",
      ["gatsbyjs", "netlify"],
      "2026-06-26T10:00:00.000Z",
    );
    const latest = makeHistory(
      "gatsby-netlify-latest",
      "gatsbyjs,netlify",
      ["gatsbyjs", "netlify"],
      "2026-06-27T10:00:00.000Z",
    );
    await insertHistory(latest);
    await insertHistory(older);

    const response = await handler(
      new Request("https://audit.example/api/reports/latest?org=Netlify&org=gatsbyjs"),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      id: latest.reportId,
      orgs: "gatsbyjs, netlify",
      scopeLabel: "ALL org packages",
      dailyTrackingEnabled: false,
      dailyTrackingNextRunAt: null,
    });

    const missing = await handler(
      new Request("https://audit.example/api/reports/latest?org=missing"),
    );
    expect(missing.status).toBe(404);

    const invalid = await handler(new Request("https://audit.example/api/reports/latest"));
    expect(invalid.status).toBe(400);
  });

  it("serves every enabled tracked org set with its latest trust snapshot", async () => {
    const netlify = makeHistory(
      "netlify-latest",
      "netlify",
      ["netlify"],
      "2026-06-27T10:00:00.000Z",
    );
    const gatsby = {
      ...makeHistory("gatsby-latest", "gatsbyjs", ["gatsbyjs"], "2026-06-26T10:00:00.000Z"),
      stagedPublish: 1,
      trustedPublisher: 1,
      provenance: 0,
      none: 2,
    };
    await insertHistory(netlify);
    await insertHistory(gatsby);
    await insertHistory(makeHistory("vite-untracked", "vite", ["vite"], "2026-06-25T10:00:00Z"));

    await handler(
      new Request(`https://audit.example/api/reports/${netlify.reportId}/schedule-daily`, {
        method: "POST",
      }),
    );
    await handler(
      new Request(`https://audit.example/api/reports/${gatsby.reportId}/schedule-daily`, {
        method: "POST",
      }),
    );
    const response = await handler(new Request("https://audit.example/api/reports/tracked"));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      orgSets: [
        {
          orgs: ["netlify"],
          nextRunAt: "2026-06-28T10:00:00.000Z",
          latest: {
            id: "netlify-latest",
            url: "/report/netlify-latest",
            capturedAt: "2026-06-27T10:00:00.000Z",
            total: 4,
            byLevel: { stagedPublish: 0, trustedPublisher: 2, provenance: 1, none: 1 },
            deprecated: 0,
            failureCount: 0,
          },
        },
        {
          orgs: ["gatsbyjs"],
          nextRunAt: "2026-06-28T12:00:00.000Z",
          latest: {
            id: "gatsby-latest",
            url: "/report/gatsby-latest",
            capturedAt: "2026-06-26T10:00:00.000Z",
            total: 4,
            byLevel: { stagedPublish: 1, trustedPublisher: 1, provenance: 0, none: 2 },
            deprecated: 0,
            failureCount: 0,
          },
        },
      ],
    });
  });

  it("enables daily tracking from saved all-scope trust reports only", async () => {
    const history = {
      ...makeHistory(
        "netlify-2026-06-27-aaaaaaaa",
        "netlify",
        ["netlify"],
        "2026-06-27T10:00:00.000Z",
      ),
      trustedPublisher: 1,
      none: 2,
    };
    await insertHistory(history);

    const response = await handler(
      new Request(`https://audit.example/api/reports/${history.reportId}/schedule-daily`, {
        method: "POST",
      }),
    );

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toEqual({
      orgs: ["netlify"],
      enabled: true,
      nextRunAt: "2026-06-28T10:00:00.000Z",
      lastRunAt: null,
      lastReportId: history.reportId,
      consecutiveFailures: 0,
    });
    const schedules = await database.sql<{
      orgKey: string;
      orgs: string[];
      enabled: boolean;
      nextRunAt: Date;
      lastReportId: string;
      consecutiveFailures: number;
    }>`
      SELECT
        org_key AS "orgKey",
        orgs_json AS orgs,
        enabled,
        next_run_at AS "nextRunAt",
        last_report_id AS "lastReportId",
        consecutive_failures AS "consecutiveFailures"
      FROM report_rerun_schedules
    `;
    expect(schedules).toEqual([
      {
        orgKey: "netlify",
        orgs: ["netlify"],
        enabled: true,
        nextRunAt: new Date("2026-06-28T10:00:00.000Z"),
        lastReportId: history.reportId,
        consecutiveFailures: 0,
      },
    ]);

    const laterHistory = makeHistory(
      "netlify-2026-06-28-bbbbbbbb",
      "netlify",
      ["netlify"],
      "2026-06-28T10:00:00.000Z",
    );
    await insertHistory(laterHistory);
    const trackedOrgReport = await handler(
      new Request(`https://audit.example/api/reports/${laterHistory.reportId}`),
    );
    await expect(trackedOrgReport.json()).resolves.toMatchObject({
      id: laterHistory.reportId,
      dailyTrackingEnabled: true,
      dailyTrackingNextRunAt: "2026-06-28T10:00:00.000Z",
    });

    const missing = await handler(
      new Request("https://audit.example/api/reports/manual-only/schedule-daily", {
        method: "POST",
      }),
    );
    expect(missing.status).toBe(400);
  });

  it("serves stored reports and returns 404 for missing ids", async () => {
    const row: StoredReport = {
      id: "netlify-2026-06-27-deadbeef",
      orgs: "netlify",
      scopeLabel: "last 6 months",
      payload: { failures: [] },
      createdAt: new Date("2026-06-27T11:00:00.000Z"),
    };
    await insertReport(row);

    const found = await handler(new Request(`https://audit.example/api/reports/${row.id}`));

    expect(found.status).toBe(200);
    await expect(found.json()).resolves.toEqual({
      ...row,
      createdAt: "2026-06-27T11:00:00.000Z",
      dailyTrackingEnabled: false,
      dailyTrackingNextRunAt: null,
    });

    const missing = await handler(new Request("https://audit.example/api/reports/missing"));
    expect(missing.status).toBe(404);
    await expect(missing.text()).resolves.toBe("Not found");
  });

  it("has no public report-write endpoint and rejects unsupported methods", async () => {
    await expect(
      handler(
        new Request("https://audit.example/api/reports", { method: "POST", body: "not json" }),
      ),
    ).resolves.toMatchObject({ status: 404 });
    await expect(
      handler(new Request("https://audit.example/api/reports", { method: "DELETE" })),
    ).resolves.toMatchObject({ status: 405 });
    await expect(
      handler(new Request("https://audit.example/api/reports/history")),
    ).resolves.toMatchObject({ status: 400 });

    expect(config).toEqual({
      path: [
        "/api/reports/history",
        "/api/reports/recent",
        "/api/reports/latest",
        "/api/reports/tracked",
        "/api/reports/:id",
        "/api/reports/:id/schedule-daily",
      ],
      rateLimit: { windowLimit: 120, windowSize: 60, aggregateBy: ["ip"] },
    });
  });
});
