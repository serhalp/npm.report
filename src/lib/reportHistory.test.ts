import { describe, expect, it } from "vitest";
import { extractTrustHistory, normalizeOrgs, orgKeyFor } from "./reportHistory";
import { trustReport } from "../test/fixtures";

describe("report history helpers", () => {
  it("normalizes org sets for exact matching", () => {
    expect(normalizeOrgs([" Netlify ", "gatsbyjs", "netlify", ""])).toEqual([
      "gatsbyjs",
      "netlify",
    ]);
    expect(orgKeyFor(["Netlify", "gatsbyjs"])).toBe("gatsbyjs,netlify");
  });

  it("extracts trust history from all-scope recent reports", () => {
    expect(
      extractTrustHistory({
        orgs: ["Netlify"],
        scope: "all",
        capturedAt: "2026-06-27T12:00:00.000Z",
        payload: {
          trust: trustReport,
          failures: [{ url: "https://registry.npmjs.org/beta", reason: "http 429" }],
        },
      }),
    ).toEqual({
      orgKey: "netlify",
      orgs: ["netlify"],
      capturedAt: "2026-06-27T12:00:00.000Z",
      total: 2,
      byLevel: trustReport.summary.byLevel,
      deprecated: 1,
      failureCount: 1,
    });
  });

  it("does not extract history from windowed, missing, or sensitive-only reports", () => {
    expect(
      extractTrustHistory({
        orgs: ["netlify"],
        scope: { months: 12 },
        capturedAt: "2026-06-27T12:00:00.000Z",
        payload: { trust: trustReport, failures: [] },
      }),
    ).toBeNull();

    expect(
      extractTrustHistory({
        orgs: ["netlify"],
        scope: "all",
        capturedAt: "2026-06-27T12:00:00.000Z",
        payload: {
          manual: { rows: [{ who: "person" }] },
          external: { rows: [{ user: "outsider", pkg: "pkg" }] },
          failures: [],
        },
      }),
    ).toBeNull();
  });

  it("does not read manual or external fields while extracting history", () => {
    const payload = {
      trust: trustReport,
      failures: [],
      get manual() {
        throw new Error("manual should not be read");
      },
      get external() {
        throw new Error("external should not be read");
      },
    };

    expect(
      extractTrustHistory({
        orgs: ["netlify"],
        scope: "all",
        capturedAt: "2026-06-27T12:00:00.000Z",
        payload,
      }),
    ).toMatchObject({ orgKey: "netlify", total: 2 });
  });
});
