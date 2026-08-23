import { describe, expect, test } from "vitest";
import { LEVEL_LABEL, LEVEL_ORDER, yn } from "./reportFormatting";

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

  test("formats booleans for tables", () => {
    expect(yn(true)).toBe("yes");
    expect(yn(false)).toBe("no");
  });
});
