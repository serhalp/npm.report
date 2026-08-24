// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  config,
  injectReportSocialMeta,
  reportSocialMeta,
} from "../../edge-functions/report-social-meta.ts";

describe("report social metadata", () => {
  it("points report previews at the report-specific PNG", () => {
    const meta = reportSocialMeta(
      new URL("https://deploy-preview-12--npm-report.netlify.app/report/acme-2026-08-23-abc?x=1"),
    );

    expect(meta).toContain(
      'property="og:image" content="https://deploy-preview-12--npm-report.netlify.app/og/report/acme-2026-08-23-abc"',
    );
    expect(meta).toContain(
      'property="og:url" content="https://deploy-preview-12--npm-report.netlify.app/report/acme-2026-08-23-abc"',
    );
    expect(meta).toContain('name="twitter:card" content="summary_large_image"');
    expect(meta).not.toContain("?x=1");
  });

  it("replaces the social metadata marker", () => {
    const html = `<head><meta charset="UTF-8" />
      <!-- social-meta:start -->
      <meta property="og:image" content="https://npm.report/og-home.png" />
      <!-- social-meta:end -->
    </head>`;
    const result = injectReportSocialMeta(
      html,
      new URL("https://npm.report/report/acme-2026-08-23-abc"),
    );

    expect(result).not.toContain("<!-- social-meta:start -->");
    expect(result).not.toContain("og-home.png");
    expect(result).toContain('property="og:image:width" content="2400"');
    expect(result).toContain('property="og:image:height" content="1260"');
    expect(result).toContain(
      'rel="canonical" href="https://npm.report/report/acme-2026-08-23-abc"',
    );
  });

  it("keeps stable org-set previews and images on stable URLs", () => {
    const meta = reportSocialMeta(new URL("https://npm.report/orgs/gatsbyjs,netlify?from=share"));

    expect(meta).toContain('property="og:url" content="https://npm.report/orgs/gatsbyjs,netlify"');
    expect(meta).toContain(
      'property="og:image" content="https://npm.report/og/orgs/gatsbyjs,netlify"',
    );
    expect(meta).not.toContain("from=share");
    expect(config.path).toEqual(["/report/:id", "/orgs/:orgs"]);
  });
});
