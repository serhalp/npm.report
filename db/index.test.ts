import { afterEach, describe, expect, it, vi } from "vitest";

describe("db connection", () => {
  afterEach(() => {
    vi.resetModules();
    vi.doUnmock("@netlify/database");
  });

  it("creates and caches the native connection lazily", async () => {
    const database = { sql: {} };
    const getConnectionString = vi.fn<() => string>(
      () => "postgres://app:secret@database.example/test",
    );
    const getDatabase = vi.fn<() => typeof database>(() => database);
    vi.doMock("@netlify/database", () => ({ getConnectionString, getDatabase }));

    const mod = await import("./index");
    expect(getConnectionString).not.toHaveBeenCalled();
    expect(getDatabase).not.toHaveBeenCalled();

    expect(mod.getDb()).toBe(database);
    expect(mod.getDb()).toBe(database);
    expect(getConnectionString).toHaveBeenCalledOnce();
    expect(getDatabase).toHaveBeenCalledOnce();
    expect(getDatabase).toHaveBeenCalledWith();
  });

  it("adds the username missing from Netlify's local Database URL", async () => {
    const database = { sql: {} };
    const getConnectionString = vi.fn<() => string>(() => "postgres://localhost:5432/postgres");
    const getDatabase = vi.fn<() => typeof database>(() => database);
    vi.doMock("@netlify/database", () => ({ getConnectionString, getDatabase }));

    const mod = await import("./index");

    expect(mod.getDb()).toBe(database);
    expect(mod.getDb()).toBe(database);
    expect(getConnectionString).toHaveBeenCalledOnce();
    expect(getDatabase).toHaveBeenCalledOnce();
    expect(getDatabase).toHaveBeenCalledWith({
      connectionString: "postgres://postgres@localhost:5432/postgres",
    });
  });

  it("does not hide a missing Database configuration", async () => {
    const getConnectionString = vi.fn<() => string>(() => {
      throw new Error("Database is not configured");
    });
    const getDatabase = vi.fn<() => void>();
    vi.doMock("@netlify/database", () => ({ getConnectionString, getDatabase }));

    const mod = await import("./index");
    expect(() => mod.getDb()).toThrow("Database is not configured");
    expect(getDatabase).not.toHaveBeenCalled();
  });
});
