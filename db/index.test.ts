import { afterEach, describe, expect, it, vi } from "vitest";

describe("db connection", () => {
  afterEach(() => {
    vi.resetModules();
    vi.doUnmock("@netlify/database");
  });

  it("creates and caches the native connection lazily", async () => {
    const database = { sql: {} };
    const getDatabase = vi.fn(() => database);
    vi.doMock("@netlify/database", () => ({ getDatabase }));

    const mod = await import("./index");
    expect(getDatabase).not.toHaveBeenCalled();

    expect(mod.getDb()).toBe(database);
    expect(mod.getDb()).toBe(database);
    expect(getDatabase).toHaveBeenCalledOnce();
  });

  it("does not hide a missing Database configuration", async () => {
    const getDatabase = vi.fn(() => {
      throw new Error("Database is not configured");
    });
    vi.doMock("@netlify/database", () => ({ getDatabase }));

    const mod = await import("./index");
    expect(() => mod.getDb()).toThrow("Database is not configured");
  });
});
