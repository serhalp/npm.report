import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

interface StoredReport {
  id: string;
  orgs: string;
  scopeLabel: string;
  payload: unknown;
}

interface StoredTrustHistory {
  reportId: string;
  orgKey: string;
  orgs: string[];
  capturedAt: Date | string;
  total: number;
  stagedPublish: number;
  trustedPublisher: number;
  provenance: number;
  none: number;
  deprecated: number;
  failureCount: number;
}

function tableName(table: unknown): string {
  if (!table || typeof table !== "object") return "";
  const nameSymbol = Object.getOwnPropertySymbols(table).find((symbol) =>
    String(symbol).includes("drizzle:Name"),
  );
  return nameSymbol ? String((table as Record<symbol, unknown>)[nameSymbol]) : "";
}

function predicateValue(predicate: unknown): string | undefined {
  return typeof predicate === "object" && predicate && "value" in predicate
    ? String(predicate.value)
    : undefined;
}

function makeDb(rows: Map<string, StoredReport>, historyRows: Map<string, StoredTrustHistory>) {
  return {
    select: vi.fn(() => ({
      from: vi.fn((table: unknown) => {
        if (tableName(table) === "report_trust_history") {
          return {
            where: vi.fn((predicate: unknown) => ({
              orderBy: vi.fn(() => ({
                limit: vi.fn(async (limit: number) => {
                  const orgKey = predicateValue(predicate);
                  return [...historyRows.values()]
                    .filter((row) => row.orgKey === orgKey)
                    .toSorted(
                      (a, b) => new Date(a.capturedAt).getTime() - new Date(b.capturedAt).getTime(),
                    )
                    .slice(0, limit);
                }),
              })),
            })),
            orderBy: vi.fn(() => ({
              limit: vi.fn(async (limit: number) =>
                [...historyRows.values()]
                  .toSorted(
                    (a, b) => new Date(b.capturedAt).getTime() - new Date(a.capturedAt).getTime(),
                  )
                  .slice(0, limit),
              ),
            })),
          };
        }

        return {
          where: vi.fn(async (predicate: unknown) => {
            const id = predicateValue(predicate);
            return id && rows.has(id) ? [rows.get(id)] : [];
          }),
        };
      }),
    })),
    insert: vi.fn((table: unknown) => ({
      values: vi.fn((row: StoredReport) => ({
        onConflictDoNothing: vi.fn(async () => {
          if (tableName(table) === "report_trust_history") {
            const historyRow = row as unknown as StoredTrustHistory;
            if (!historyRows.has(historyRow.reportId)) {
              historyRows.set(historyRow.reportId, historyRow);
            }
            return;
          }

          if (!rows.has(row.id)) rows.set(row.id, row);
        }),
      })),
    })),
  };
}

async function loadHandler(
  rows = new Map<string, StoredReport>(),
  historyRows = new Map<string, StoredTrustHistory>(),
) {
  vi.resetModules();
  const db = makeDb(rows, historyRows);
  vi.doMock("drizzle-orm", () => ({
    asc: vi.fn((column: unknown) => ({ column })),
    desc: vi.fn((column: unknown) => ({ column })),
    eq: vi.fn((_column: unknown, value: string) => ({ value })),
  }));
  vi.doMock("../../../db/index.js", () => ({ db }));
  const mod = await import("../../functions/reports");
  return { handler: mod.default, config: mod.config, db, rows, historyRows };
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

  it("stores all-scope recent trust history separately from shared report payloads", async () => {
    const { handler, historyRows } = await loadHandler();
    const payload = {
      recent: {
        summary: {
          scopeLabel: "ALL org packages",
          orgs: ["Netlify"],
          total: 4,
          deprecated: 1,
          byLevel: {
            stagedPublish: 1,
            trustedPublisher: 2,
            provenance: 0,
            none: 1,
          },
        },
        rows: [{ pkg: "secret-free" }],
      },
      manual: { rows: [{ who: "sensitive-publisher" }] },
      external: { rows: [{ user: "sensitive-user", pkg: "pkg" }] },
      failures: [{ url: "https://registry.npmjs.org/pkg", reason: "http 429" }],
    };

    const response = await handler(
      jsonPost({
        orgs: ["Netlify"],
        scope: "all",
        capturedAt: "2026-06-27T10:00:00.000Z",
        payload,
      }),
    );

    const { id } = (await response.json()) as { id: string };
    expect(historyRows.get(id)).toEqual({
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

  it("does not store history for manual or external only shares", async () => {
    const { handler, historyRows } = await loadHandler();

    await handler(
      jsonPost({
        orgs: ["netlify"],
        scope: "all",
        capturedAt: "2026-06-27T10:00:00.000Z",
        payload: {
          manual: { rows: [{ who: "sensitive-publisher" }] },
          external: { rows: [{ user: "sensitive-user", pkg: "pkg" }] },
          failures: [],
        },
      }),
    );

    expect(historyRows.size).toBe(0);
  });

  it("serves public trust history by exact normalized org set without payloads", async () => {
    const alpha: StoredTrustHistory = {
      reportId: "netlify-gatsby-2026-06-26-aaaaaaaa",
      orgKey: "gatsbyjs,netlify",
      orgs: ["gatsbyjs", "netlify"],
      capturedAt: "2026-06-26T10:00:00.000Z",
      total: 4,
      stagedPublish: 0,
      trustedPublisher: 1,
      provenance: 1,
      none: 2,
      deprecated: 0,
      failureCount: 0,
    };
    const beta: StoredTrustHistory = {
      ...alpha,
      reportId: "netlify-gatsby-2026-06-27-bbbbbbbb",
      capturedAt: "2026-06-27T10:00:00.000Z",
      trustedPublisher: 2,
      provenance: 1,
      none: 1,
      failureCount: 1,
    };
    const other: StoredTrustHistory = {
      ...alpha,
      reportId: "netlify-2026-06-27-cccccccc",
      orgKey: "netlify",
      orgs: ["netlify"],
    };
    const historyRows = new Map([
      [beta.reportId, beta],
      [other.reportId, other],
      [alpha.reportId, alpha],
    ]);
    const { handler } = await loadHandler(new Map(), historyRows);

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
          byLevel: {
            stagedPublish: 0,
            trustedPublisher: 1,
            provenance: 1,
            none: 2,
          },
          deprecated: 0,
          failureCount: 0,
        },
        {
          id: beta.reportId,
          url: `/report/${beta.reportId}`,
          capturedAt: "2026-06-27T10:00:00.000Z",
          total: 4,
          byLevel: {
            stagedPublish: 0,
            trustedPublisher: 2,
            provenance: 1,
            none: 1,
          },
          deprecated: 0,
          failureCount: 1,
        },
      ],
    });
  });

  it("serves recent trust report links deduped by org set", async () => {
    const makeHistory = (
      reportId: string,
      orgKey: string,
      orgs: string[],
      capturedAt: string,
    ): StoredTrustHistory => ({
      reportId,
      orgKey,
      orgs,
      capturedAt,
      total: 4,
      stagedPublish: 0,
      trustedPublisher: 2,
      provenance: 1,
      none: 1,
      deprecated: 0,
      failureCount: 0,
    });
    const historyRows = new Map<string, StoredTrustHistory>(
      [
        makeHistory("netlify-older", "netlify", ["netlify"], "2026-06-20T10:00:00.000Z"),
        makeHistory("netlify-newer", "netlify", ["netlify"], "2026-06-27T10:00:00.000Z"),
        makeHistory("gatsby", "gatsbyjs", ["gatsbyjs"], "2026-06-26T10:00:00.000Z"),
        makeHistory("vite", "vite", ["vite"], "2026-06-25T10:00:00.000Z"),
        makeHistory("svelte", "svelte", ["svelte"], "2026-06-24T10:00:00.000Z"),
        makeHistory("rollup", "rollup", ["rollup"], "2026-06-23T10:00:00.000Z"),
        makeHistory("react", "react", ["react"], "2026-06-22T10:00:00.000Z"),
      ].map((row) => [row.reportId, row]),
    );
    const { handler } = await loadHandler(new Map(), historyRows);

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
    await expect(
      handler(new Request("https://audit.example/api/reports/history")),
    ).resolves.toMatchObject({ status: 400 });

    expect(config).toEqual({
      path: ["/api/reports", "/api/reports/history", "/api/reports/recent", "/api/reports/:id"],
    });
  });
});
