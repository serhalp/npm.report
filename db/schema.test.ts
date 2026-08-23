import { describe, expect, it } from "vitest";
import { AuditJobRowSchema, parseRows, ReportTrustHistoryRowSchema, serializeJson } from "./schema";

describe("database row contracts", () => {
  it("accepts decoded Postgres dates and JSONB values", () => {
    const capturedAt = new Date("2026-08-09T12:00:00.000Z");
    expect(
      parseRows(ReportTrustHistoryRowSchema, [
        {
          reportId: "report-1",
          orgKey: "acme",
          orgs: ["acme"],
          capturedAt,
          total: 4,
          stagedPublish: 1,
          trustedPublisher: 1,
          provenance: 1,
          none: 1,
          deprecated: 0,
          failureCount: 0,
        },
      ]),
    ).toEqual([expect.objectContaining({ orgs: ["acme"], capturedAt })]);
  });

  it("rejects rows that disagree with the migration-backed contract", () => {
    expect(() =>
      parseRows(AuditJobRowSchema, [
        {
          id: "job-1",
          request: {},
          log: [],
          status: "finished",
          result: null,
          reportId: null,
          error: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]),
    ).toThrow(/Expected.*running.*done.*error.*finished/);
  });

  it("serializes arrays as JSON rather than Postgres array parameters", () => {
    expect(serializeJson([{ seq: 0, line: "working" }])).toBe('[{"seq":0,"line":"working"}]');
    expect(() => serializeJson(undefined)).toThrow("not serializable");
  });
});
