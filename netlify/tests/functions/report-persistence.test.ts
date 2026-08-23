// @vitest-environment node
import type { DatabaseConnection } from "@netlify/database";
import type { NetlifyDB } from "@netlify/database-dev";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { parseRows, ReportRowSchema, ReportTrustHistoryRowSchema } from "#db/schema";
import type { AuditResult } from "#shared/types";
import { resetTestDatabase, startTestDatabase, stopTestDatabase } from "../database.js";

let database: DatabaseConnection;
let local: NetlifyDB;
let persistence: typeof import("#server/report-persistence");

beforeAll(async () => {
  const started = await startTestDatabase();
  local = started.local;
  vi.stubEnv("NETLIFY_DB_URL", started.connectionString);
  vi.stubEnv("NETLIFY_DB_DRIVER", "server");
  vi.resetModules();
  database = (await import("#db/index")).getDb();
  persistence = await import("#server/report-persistence");
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

// The audit-stream edge function is the only writer of reports; these exercise
// that persistence contract against Netlify's real local Postgres-compatible DB.
describe("saveReportSnapshot", () => {
  it("stores a report under a stable content-hash id, idempotent per UTC day", async () => {
    const payload = { trust: { rows: [] }, failures: [] };
    const input = {
      orgs: ["Netlify", "Gatsby"],
      scope: { months: 6 },
      scopeLabel: "last 6 months",
      capturedAt: "2026-06-27T10:00:00.000Z",
      payload,
    };

    const first = await persistence.saveReportSnapshot(input);
    const second = await persistence.saveReportSnapshot(input);

    expect(first.id).toBe(second.id);
    expect(first.id).toMatch(/^netlify-gatsby-2026-06-27-[a-f0-9]{16}$/);
    const rows = parseRows(
      ReportRowSchema,
      await database.sql<unknown>`
        SELECT
          id,
          orgs,
          scope_label AS "scopeLabel",
          payload,
          created_at AS "createdAt"
        FROM reports
      `,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      id: first.id,
      orgs: "Netlify, Gatsby",
      scopeLabel: "last 6 months",
      payload,
    });
  });

  it("extracts all-scope trust history separately from the shared payload", async () => {
    const payload = {
      trust: {
        summary: {
          scopeLabel: "ALL org packages",
          orgs: ["Netlify"],
          total: 4,
          provenance: 0,
          trustedPublisher: 2,
          stagedPublish: 1,
          deprecated: 1,
          byLevel: {
            stagedPublish: 1,
            trustedPublisher: 2,
            provenance: 0,
            none: 1,
          },
        },
        rows: [
          {
            pkg: "secret-free",
            latestPublish: "2026-06-27T10:00:00.000Z",
            version: "1.0.0",
            level: "stagedPublish",
            provenance: false,
            trustedPublisher: false,
            stagedPublish: true,
            publisher: "release-bot",
            deprecated: false,
            downloads: 42,
          },
        ],
      },
      manual: {
        rows: [
          {
            when: "2026-06-27T10:00:00.000Z",
            who: "sensitive-publisher",
            ref: "secret-free@1.0.0",
          },
        ],
        totalScanned: 1,
        bots: [],
        byPublisher: [{ who: "sensitive-publisher", count: 1 }],
      },
      external: {
        rows: [{ user: "sensitive-user", pkg: "pkg" }],
        distinctUsers: 1,
        byUser: [{ user: "sensitive-user", count: 1 }],
      },
      failures: [{ url: "https://registry.npmjs.org/pkg", reason: "http 429" }],
    } satisfies AuditResult;

    const { id } = await persistence.saveReportSnapshot({
      orgs: ["Netlify"],
      scope: "all",
      capturedAt: "2026-06-27T10:00:00.000Z",
      payload,
    });

    const [history] = parseRows(
      ReportTrustHistoryRowSchema,
      await database.sql<unknown>`
        SELECT
          report_id AS "reportId",
          org_key AS "orgKey",
          orgs_json AS orgs,
          captured_at AS "capturedAt",
          total,
          staged_publish AS "stagedPublish",
          trusted_publisher AS "trustedPublisher",
          provenance,
          none,
          deprecated,
          failure_count AS "failureCount"
        FROM report_trust_history
        WHERE report_id = ${id}
      `,
    );
    expect(history).toEqual({
      reportId: id,
      orgKey: "netlify",
      orgs: ["netlify"],
      capturedAt: new Date("2026-06-27T10:00:00.000Z"),
      total: 4,
      stagedPublish: 1,
      trustedPublisher: 2,
      provenance: 0,
      none: 1,
      deprecated: 1,
      failureCount: 1,
    });
  });

  it("does not extract history for non-trust or windowed reports", async () => {
    await persistence.saveReportSnapshot({
      orgs: ["netlify"],
      scope: "all",
      capturedAt: "2026-06-27T10:00:00.000Z",
      payload: { manual: { rows: [] }, external: { rows: [] }, failures: [] },
    });
    await persistence.saveReportSnapshot({
      orgs: ["netlify"],
      scope: { months: 6 },
      capturedAt: "2026-06-27T10:00:00.000Z",
      payload: {
        trust: {
          summary: {
            scopeLabel: "last 6 months",
            orgs: ["netlify"],
            total: 1,
            deprecated: 0,
            byLevel: { stagedPublish: 0, trustedPublisher: 0, provenance: 0, none: 1 },
          },
          rows: [],
        },
        failures: [],
      },
    });

    const rows = await database.sql`SELECT report_id FROM report_trust_history`;
    expect(rows).toEqual([]);
  });
});

describe("slugifyOrgs", () => {
  it("always produces a URL-safe slug for hostile org inputs", () => {
    expect(persistence.slugifyOrgs(["../../etc/passwd"])).toBe("etc-passwd");
    expect(persistence.slugifyOrgs(["a/b", "c\\d"])).toBe("a-b-c-d");
    expect(persistence.slugifyOrgs(["Foo Bar!!!"])).toBe("foo-bar");
    expect(persistence.slugifyOrgs(["  spaced  "])).toBe("spaced");
    expect(persistence.slugifyOrgs(["café-☕-münchen"])).toBe("caf-m-nchen");

    for (const hostile of [[""], ["..."], ["///"], ["%2e%2e"], ["\0"], []]) {
      const slug = persistence.slugifyOrgs(hostile);
      expect(slug).toMatch(/^[a-z0-9-]+$/);
      expect(slug).not.toContain("..");
      expect(slug).not.toContain("/");
    }
  });
});
