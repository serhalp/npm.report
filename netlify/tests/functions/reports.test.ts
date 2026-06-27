import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

interface StoredReport {
  id: string;
  orgs: string;
  scopeLabel: string;
  payload: unknown;
}

function makeDb(rows: Map<string, StoredReport>) {
  return {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(async (id: string | undefined) => {
          return id && rows.has(id) ? [rows.get(id)] : [];
        }),
      })),
    })),
    insert: vi.fn(() => ({
      values: vi.fn((row: StoredReport) => ({
        onConflictDoNothing: vi.fn(async () => {
          if (!rows.has(row.id)) rows.set(row.id, row);
        }),
      })),
    })),
  };
}

async function loadHandler(rows = new Map<string, StoredReport>()) {
  vi.resetModules();
  const db = makeDb(rows);
  vi.doMock("drizzle-orm", () => ({
    eq: vi.fn((_column: unknown, value: string) => value),
  }));
  vi.doMock("../../../db/index.js", () => ({ db }));
  const mod = await import("../../functions/reports");
  return { handler: mod.default, config: mod.config, db, rows };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-06-27T12:00:00.000Z"));
});

afterEach(() => {
  vi.useRealTimers();
  vi.doUnmock("drizzle-orm");
  vi.doUnmock("../../../db/index.js");
});

function jsonPost(body: unknown) {
  return new Request("https://audit.example/api/reports", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

describe("reports function", () => {
  it("stores shared reports under stable human-readable content IDs", async () => {
    const { handler, rows } = await loadHandler();
    const payload = { recent: { rows: [] }, failures: [] };

    const first = await handler(
      jsonPost({
        orgs: ["Netlify", "Gatsby"],
        scopeLabel: "last 6 months",
        payload,
      }),
    );
    const second = await handler(
      jsonPost({
        orgs: ["Netlify", "Gatsby"],
        scopeLabel: "last 6 months",
        payload,
      }),
    );

    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    const { id } = (await first.json()) as { id: string };
    await expect(second.json()).resolves.toEqual({ id });
    expect(id).toMatch(/^netlify-gatsby-2026-06-27-[a-f0-9]{8}$/);
    expect(rows.size).toBe(1);
    expect(rows.get(id)).toEqual({
      id,
      orgs: "Netlify, Gatsby",
      scopeLabel: "last 6 months",
      payload,
    });
  });

  it("serves stored reports and returns 404 for missing ids", async () => {
    const row: StoredReport = {
      id: "netlify-2026-06-27-deadbeef",
      orgs: "netlify",
      scopeLabel: "last 6 months",
      payload: { failures: [] },
    };
    const { handler } = await loadHandler(new Map([[row.id, row]]));

    const found = await handler(new Request(`https://audit.example/api/reports/${row.id}`));

    expect(found.status).toBe(200);
    await expect(found.json()).resolves.toEqual(row);

    const missing = await handler(new Request("https://audit.example/api/reports/missing"));

    expect(missing.status).toBe(404);
    await expect(missing.text()).resolves.toBe("Not found");
  });

  it("rejects invalid requests and unsupported methods", async () => {
    const { handler, config } = await loadHandler();

    await expect(
      handler(
        new Request("https://audit.example/api/reports", { method: "POST", body: "not json" }),
      ),
    ).resolves.toMatchObject({ status: 400 });

    await expect(handler(jsonPost({ orgs: ["netlify"] }))).resolves.toMatchObject({ status: 400 });
    await expect(
      handler(new Request("https://audit.example/api/reports", { method: "DELETE" })),
    ).resolves.toMatchObject({ status: 405 });

    expect(config).toEqual({
      path: ["/api/reports", "/api/reports/:id"],
    });
  });
});
