import { describe, expect, it } from "vitest";
import {
  anyTrustCount,
  extractTrustHistory,
  normalizeOrgs,
  orgKeyFor,
  strongTrustCount,
  trustPercent,
} from "./reportHistory";
import { trustReport } from "../test/fixtures";

describe("report history helpers", () => {
  it("normalizes org sets for exact matching", () => {
    expect(normalizeOrgs([" Netlify ", "gatsbyjs", "netlify", ""])).toEqual([
      "gatsbyjs",
      "netlify",
    ]);
    expect(orgKeyFor(["Netlify", "gatsbyjs"])).toBe("gatsbyjs,netlify");
  });

  const point = {
    id: "x",
    url: "/report/x",
    capturedAt: "2026-06-27T12:00:00.000Z",
    total: 10,
    deprecated: 0,
    failureCount: 0,
    byLevel: { stagedPublish: 2, trustedPublisher: 3, provenance: 1, none: 4 },
  };

  it("strongTrustCount counts only the gold-accented tiers (staged + trusted)", () => {
    expect(strongTrustCount(point)).toBe(5);
  });

  it("anyTrustCount counts every signal except none", () => {
    expect(anyTrustCount(point)).toBe(6);
  });

  it("trustPercent is a plain ratio and guards an empty total", () => {
    expect(trustPercent(6, 10)).toBe(60);
    expect(trustPercent(0, 0)).toBe(0);
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
