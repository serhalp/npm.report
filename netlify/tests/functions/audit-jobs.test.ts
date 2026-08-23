// @vitest-environment node
import type { DatabaseConnection } from "@netlify/database";
import type { NetlifyDB } from "@netlify/database-dev";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { resetTestDatabase, startTestDatabase, stopTestDatabase } from "../database.js";

let database: DatabaseConnection;
let local: NetlifyDB;
let jobs: typeof import("#server/audit-jobs");

beforeAll(async () => {
  const started = await startTestDatabase();
  local = started.local;
  vi.stubEnv("NETLIFY_DB_URL", started.connectionString);
  vi.stubEnv("NETLIFY_DB_DRIVER", "server");
  vi.resetModules();
  database = (await import("#db/index")).getDb();
  jobs = await import("#server/audit-jobs");
});

beforeEach(async () => {
  await resetTestDatabase(database);
});

afterAll(async () => {
  await stopTestDatabase(local, database);
  vi.unstubAllEnvs();
});

describe("resumable audit jobs", () => {
  it("atomically distinguishes a fresh run from a reconnect", async () => {
    await expect(jobs.createJobIfAbsent("job-1", { orgs: ["vue"] })).resolves.toBe(true);
    await expect(jobs.createJobIfAbsent("job-1", { orgs: ["vue"] })).resolves.toBe(false);
  });

  it("round-trips progress and terminal state through JSONB", async () => {
    await jobs.createJobIfAbsent("job-1", { orgs: ["vue"], all: true });
    await jobs.updateJobLog("job-1", [
      { seq: 0, line: "Discovering packages" },
      { seq: 1, line: "Checking manifests" },
    ]);
    await jobs.finishJob("job-1", {
      status: "done",
      log: [{ seq: 0, line: "Done." }],
      result: { trust: { rows: [] }, failures: [] },
      reportId: "vue-2026-08-09-deadbeef",
    });

    await expect(jobs.getJob("job-1")).resolves.toMatchObject({
      id: "job-1",
      request: { orgs: ["vue"], all: true },
      log: [{ seq: 0, line: "Done." }],
      status: "done",
      result: { trust: { rows: [] }, failures: [] },
      reportId: "vue-2026-08-09-deadbeef",
      error: null,
      createdAt: expect.any(Date),
      updatedAt: expect.any(Date),
    });
  });

  it("prunes only jobs older than the requested interval", async () => {
    await jobs.createJobIfAbsent("old", {});
    await jobs.createJobIfAbsent("recent", {});
    await database.sql`
      UPDATE audit_jobs
      SET created_at = now() - interval '3 hours'
      WHERE id = ${"old"}
    `;

    await jobs.deleteExpiredJobs("2 hours");

    await expect(jobs.getJob("old")).resolves.toBeNull();
    await expect(jobs.getJob("recent")).resolves.not.toBeNull();
  });
});
