import { afterEach, describe, expect, it, vi } from "vitest";

// createJobIfAbsent is the fresh-vs-resume gate: the request that INSERTs the row
// runs the audit, a request that hits an existing row tails it. Mock the db's
// insert().values().onConflictDoNothing().returning() chain over a Map so a
// conflict returns no rows.
function makeDb(rows: Map<string, unknown>) {
  return {
    insert: vi.fn(() => ({
      values: vi.fn((row: { id: string }) => ({
        onConflictDoNothing: vi.fn(() => ({
          returning: vi.fn(async () => {
            if (rows.has(row.id)) return [];
            rows.set(row.id, row);
            return [{ id: row.id }];
          }),
        })),
      })),
    })),
  };
}

async function load(rows = new Map<string, unknown>()) {
  vi.resetModules();
  vi.doMock("../../../db/index.js", () => ({ db: makeDb(rows) }));
  return import("../../functions/_shared/audit-jobs");
}

afterEach(() => vi.resetModules());

describe("createJobIfAbsent", () => {
  it("returns true when it creates the row (fresh run)", async () => {
    const { createJobIfAbsent } = await load();
    expect(await createJobIfAbsent("job-1", { orgs: ["vue"] })).toBe(true);
  });

  it("returns false when the row already exists (reconnect tails instead)", async () => {
    const { createJobIfAbsent } = await load();
    expect(await createJobIfAbsent("job-1", { orgs: ["vue"] })).toBe(true);
    expect(await createJobIfAbsent("job-1", { orgs: ["vue"] })).toBe(false);
  });
});
