// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const getReportSocialData = vi.hoisted(() =>
  vi.fn<typeof import("#node/report-social").getReportSocialData>(),
);

vi.mock("#node/report-social", () => ({ getReportSocialData }));

import handler, {
  config,
  homeCardHtml,
  renderHomeCard,
  reportCardHtml,
} from "../functions/report-og.js";

beforeEach(() => {
  getReportSocialData.mockResolvedValue({
    id: "acme-2026-08-23-0123456789abcdef",
    orgs: "acme",
    createdAt: new Date("2026-08-23T12:34:56.000Z"),
    trust: {
      total: 60,
      byLevel: {
        stagedPublish: 8,
        trustedPublisher: 16,
        provenance: 15,
        none: 21,
      },
    },
    history: [
      {
        id: "acme-2026-08-22-abcdef",
        capturedAt: new Date("2026-08-22T12:34:56.000Z"),
        total: 60,
        byLevel: {
          stagedPublish: 7,
          trustedPublisher: 14,
          provenance: 14,
          none: 25,
        },
      },
      {
        id: "acme-2026-08-23-0123456789abcdef",
        capturedAt: new Date("2026-08-23T12:34:56.000Z"),
        total: 60,
        byLevel: {
          stagedPublish: 8,
          trustedPublisher: 16,
          provenance: 15,
          none: 21,
        },
      },
    ],
  });
});

describe("report OG image function", () => {
  it("uses the app header copy on the homepage card", () => {
    const html = homeCardHtml();

    expect(html).toContain("Supply-chain trust signals");
    expect(html).toContain("for npm orgs.");
    expect(html).toContain("Audit, visualize, share, track over time.");
  });

  it("renders the homepage card at the social-image dimensions", async () => {
    const image = new Uint8Array(await renderHomeCard());
    const png = new DataView(image.buffer, image.byteOffset, image.byteLength);

    expect([...image.subarray(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
    expect(png.getUint32(16)).toBe(2_400);
    expect(png.getUint32(20)).toBe(1_260);
  });

  it("renders a PNG for a stored report", async () => {
    const response = await handler(
      new Request("https://npm.report/og/report/acme-2026-08-23-0123456789abcdef"),
    );
    const image = new Uint8Array(await response.arrayBuffer());

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/png");
    expect(response.headers.get("cache-control")).toBe("public, max-age=0, must-revalidate");
    expect(response.headers.get("netlify-cdn-cache-control")).toContain("durable");
    expect([...image.subarray(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
    expect(image.byteLength).toBeGreaterThan(1_000);
    const png = new DataView(image.buffer, image.byteOffset, image.byteLength);
    expect(png.getUint32(16)).toBe(2_400);
    expect(png.getUint32(20)).toBe(1_260);
    expect(getReportSocialData).toHaveBeenCalledWith("acme-2026-08-23-0123456789abcdef");
  });

  it("returns 404 for malformed and unknown report ids", async () => {
    const malformed = await handler(new Request("https://npm.report/og/report/%"));
    expect(malformed.status).toBe(404);

    getReportSocialData.mockResolvedValueOnce(null);
    const missing = await handler(new Request("https://npm.report/og/report/missing"));
    expect(missing.status).toBe(404);
  });

  it("rejects methods other than GET", async () => {
    const response = await handler(
      new Request("https://npm.report/og/report/acme", { method: "POST" }),
    );
    expect(response.status).toBe(405);
    expect(getReportSocialData).not.toHaveBeenCalled();
  });

  it("escapes report data before rendering HTML", () => {
    const html = reportCardHtml({
      id: "unsafe",
      orgs: 'acme <script>alert("nope")</script>',
      createdAt: null,
      trust: null,
      history: [],
    });
    expect(html).toContain("acme &lt;script&gt;alert(&quot;nope&quot;)&lt;/script&gt;");
    expect(html).toContain('<img src="app-logo"');
  });

  it("renders each trust level with its count and percentage", () => {
    const html = reportCardHtml({
      id: "acme",
      orgs: "acme",
      createdAt: new Date("2026-08-23T12:34:56.000Z"),
      trust: {
        total: 60,
        byLevel: {
          stagedPublish: 8,
          trustedPublisher: 16,
          provenance: 15,
          none: 21,
        },
      },
      history: [],
    });

    expect(html).toContain("Staged publish");
    expect(html).toContain("13.3%");
    expect(html).toContain("Trusted publisher");
    expect(html).toContain("26.7%");
    expect(html).toContain("Provenance only");
    expect(html).toContain("25%");
    expect(html).toContain("No trust signal");
    expect(html).toContain("35%");
    expect(html).toContain('class="strong-summary"');
    expect(html).toContain("24 · 40%");
    expect(html).toContain("60 packages");
    expect(html).toContain("audited on 2026-08-23 12:34 UTC");
  });

  it("includes the trust graph only for a multi-point history", () => {
    const base = {
      id: "acme",
      orgs: "acme",
      createdAt: new Date("2026-08-23T12:34:56.000Z"),
      trust: {
        total: 2,
        byLevel: { stagedPublish: 0, trustedPublisher: 1, provenance: 0, none: 1 },
      },
    };
    const point = {
      id: "acme",
      capturedAt: new Date("2026-08-23T12:34:56.000Z"),
      total: 2,
      byLevel: { stagedPublish: 0, trustedPublisher: 1, provenance: 0, none: 1 },
    };

    expect(reportCardHtml({ ...base, history: [point, point] })).toContain("Progress over time");
    expect(reportCardHtml({ ...base, history: [point] })).not.toContain("Progress over time");
  });

  it("owns the report image route", () => {
    expect(config.path).toBe("/og/report/:id");
  });
});
