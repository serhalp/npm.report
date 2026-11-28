import { describe, expect, it } from "vitest";
import { AuditResultSchema, parseOrNull } from "./schemas";

describe("AuditResultSchema", () => {
  it("parses legacy external payloads without a scan count as zero", () => {
    const parsed = parseOrNull(AuditResultSchema, {
      external: { rows: [], distinctUsers: 0, byUser: [] },
      failures: [],
    });

    expect(parsed?.external?.scanned).toBe(0);
  });

  it("preserves the external scan count when present", () => {
    const parsed = parseOrNull(AuditResultSchema, {
      external: { rows: [], distinctUsers: 0, byUser: [], scanned: 60 },
      failures: [],
    });

    expect(parsed?.external?.scanned).toBe(60);
  });
});
