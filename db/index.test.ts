import { afterEach, describe, expect, it, vi } from "vitest";
import type { ServerlessDatabaseConnection } from "@netlify/database";

describe("db connection", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
    vi.doUnmock("@netlify/database");
  });

  it("connects lazily — getDatabase runs on first query, not at import", async () => {
    const getDatabase = vi.fn(() => {
      throw new Error("lazy-check");
    });
    vi.doMock("@netlify/database", () => ({ getDatabase }));

    const mod = await import("./index");
    // Importing must not touch the database, so a function that only imports this
    // module (e.g. audit-stream, before its final save) still loads even when the
    // connection string is absent.
    expect(getDatabase).not.toHaveBeenCalled();

    // The connection is attempted on first property access.
    expect(() => mod.db.select()).toThrow("lazy-check");
    expect(getDatabase).toHaveBeenCalledOnce();
  });

  it("routes Drizzle's serverless positional HTTP calls through Neon query()", async () => {
    vi.stubGlobal("Netlify", {
      env: {
        get: (key: string) => {
          if (key === "NETLIFY_DB_URL") return "postgresql://user:pass@example.com/db";
          if (key === "NETLIFY_DB_DRIVER") return "serverless";
          return undefined;
        },
      },
    });

    const directCall = vi.fn(() => {
      throw new Error("direct Neon template call should not be used");
    });
    const query = vi.fn().mockResolvedValue({ rows: [] });
    const unsafe = vi.fn();
    const transaction = vi.fn();
    const httpClient = Object.assign(directCall, { query, unsafe, transaction });
    const database = {
      driver: "serverless",
      connectionString: "postgresql://user:pass@example.com/db",
      httpClient,
      pool: {},
      sql: {},
    } as unknown as ServerlessDatabaseConnection;
    const { getDrizzleClient } = await import("./index");
    const client = getDrizzleClient(database);
    const positionalQuery =
      client.driver === "serverless"
        ? (client.httpClient as unknown as (
            sql: string,
            params: unknown[],
            options: unknown,
          ) => Promise<unknown>)
        : undefined;
    const options = { arrayMode: true, fullResults: true };

    await positionalQuery?.("select $1", [1], options);

    expect(directCall).not.toHaveBeenCalled();
    expect(query).toHaveBeenCalledWith("select $1", [1], options);
  });
});
