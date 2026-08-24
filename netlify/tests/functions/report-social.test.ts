// @vitest-environment node
import type { DatabaseConnection } from "@netlify/database";
import type { NetlifyDB } from "@netlify/database-dev";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { serializeJson } from "#db/schema";
import { resetTestDatabase, startTestDatabase, stopTestDatabase } from "../database.js";

let database: DatabaseConnection;
let local: NetlifyDB;
let getReportSocialData: typeof import("#node/report-social").getReportSocialData;
let getLatestReportSocialData: typeof import("#node/report-social").getLatestReportSocialData;

async function insertTrustHistory(
  reportId: string,
  capturedAt: Date,
  byLevel: {
    stagedPublish: number;
    trustedPublisher: number;
    provenance: number;
    none: number;
  },
): Promise<void> {
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
      ${reportId},
      ${"acme"},
      ${serializeJson(["acme"])}::jsonb,
      ${capturedAt},
      ${60},
      ${byLevel.stagedPublish},
      ${byLevel.trustedPublisher},
      ${byLevel.provenance},
      ${byLevel.none},
      ${0},
      ${0}
    )
  `;
}

beforeAll(async () => {
  const started = await startTestDatabase();
  local = started.local;
  vi.stubEnv("NETLIFY_DB_URL", started.connectionString);
  vi.stubEnv("NETLIFY_DB_DRIVER", "server");
  vi.resetModules();
  database = (await import("#db/index")).getDb();
  ({ getLatestReportSocialData, getReportSocialData } = await import("#node/report-social"));
});

beforeEach(async () => {
  await resetTestDatabase(database);
});

afterAll(async () => {
  await stopTestDatabase(local, database);
  vi.unstubAllEnvs();
});

describe("getReportSocialData", () => {
  it("projects trust metrics and the matching all-package history without loading report rows", async () => {
    const payload = {
      trust: {
        rows: [{ pkg: "intentionally-not-selected" }],
        summary: {
          total: 60,
          byLevel: {
            stagedPublish: 8,
            trustedPublisher: 16,
            provenance: 15,
            none: 21,
          },
        },
      },
      failures: [],
    };
    const createdAt = new Date("2026-08-23T12:34:56.000Z");
    const previousAt = new Date("2026-08-22T12:34:56.000Z");
    await database.sql`
      INSERT INTO reports (id, orgs, scope_label, payload, created_at)
      VALUES
        (
          ${"acme-previous"},
          ${"acme"},
          ${"ALL org packages"},
          ${serializeJson({ failures: [] })}::jsonb,
          ${previousAt}
        ),
        (
          ${"acme-report"},
          ${"acme"},
          ${"ALL org packages"},
          ${serializeJson(payload)}::jsonb,
          ${createdAt}
        )
    `;
    const previousLevels = {
      stagedPublish: 7,
      trustedPublisher: 14,
      provenance: 14,
      none: 25,
    };
    const currentLevels = {
      stagedPublish: 8,
      trustedPublisher: 16,
      provenance: 15,
      none: 21,
    };
    await insertTrustHistory("acme-previous", previousAt, previousLevels);
    await insertTrustHistory("acme-report", createdAt, currentLevels);

    await expect(getReportSocialData("acme-report")).resolves.toEqual({
      id: "acme-report",
      orgs: "acme",
      createdAt,
      trust: {
        total: 60,
        byLevel: currentLevels,
      },
      history: [
        { id: "acme-previous", capturedAt: previousAt, total: 60, byLevel: previousLevels },
        { id: "acme-report", capturedAt: createdAt, total: 60, byLevel: currentLevels },
      ],
    });
  });

  it("resolves stable org-set social data to the latest snapshot", async () => {
    const olderAt = new Date("2026-08-22T12:34:56.000Z");
    const latestAt = new Date("2026-08-23T12:34:56.000Z");
    const payload = {
      trust: {
        summary: {
          total: 2,
          byLevel: { stagedPublish: 0, trustedPublisher: 1, provenance: 0, none: 1 },
        },
      },
      failures: [],
    };
    await database.sql`
      INSERT INTO reports (id, orgs, scope_label, payload, created_at)
      VALUES
        (${"acme-older"}, ${"acme"}, ${"ALL org packages"}, ${serializeJson(payload)}::jsonb, ${olderAt}),
        (${"acme-latest"}, ${"acme"}, ${"ALL org packages"}, ${serializeJson(payload)}::jsonb, ${latestAt})
    `;
    const levels = { stagedPublish: 0, trustedPublisher: 1, provenance: 0, none: 1 };
    await insertTrustHistory("acme-latest", latestAt, levels);
    await insertTrustHistory("acme-older", olderAt, levels);

    await expect(getLatestReportSocialData(["Acme"])).resolves.toMatchObject({
      id: "acme-latest",
      orgs: "acme",
    });
    await expect(getLatestReportSocialData(["missing"])).resolves.toBeNull();
  });

  it("returns a report without invented trust metrics when no trust audit exists", async () => {
    await database.sql`
      INSERT INTO reports (id, orgs, scope_label, payload)
      VALUES (
        ${"manual-report"},
        ${"acme"},
        ${"last 12 months"},
        ${serializeJson({ manual: { rows: [] }, failures: [] })}::jsonb
      )
    `;

    await expect(getReportSocialData("manual-report")).resolves.toMatchObject({
      id: "manual-report",
      orgs: "acme",
      trust: null,
      history: [],
    });
  });
});
