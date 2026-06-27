import { describe, expect, test } from "vitest";
import { fmtDate, LEVEL_LABEL, LEVEL_ORDER, yn } from "./reportFormatting";

describe("report formatting", () => {
  test("formats trust labels and order consistently with reports", () => {
    expect(LEVEL_ORDER).toEqual({
      none: 0,
      provenance: 1,
      trustedPublisher: 2,
      stagedPublish: 3,
    });
    expect(LEVEL_LABEL.trustedPublisher).toBe("trusted publisher");
    expect(LEVEL_LABEL.stagedPublish).toBe("staged publish");
  });

  test("formats booleans and ISO dates for tables", () => {
    expect(yn(true)).toBe("yes");
    expect(yn(false)).toBe("no");
    expect(fmtDate("2026-06-01T02:03:04.000Z")).toBe("2026-06-01 02:03:04Z");
    expect(fmtDate("")).toBe("—");
  });
});
