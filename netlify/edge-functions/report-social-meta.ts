import type { Config, Context } from "@netlify/edge-functions";
import { OG_HEIGHT, OG_WIDTH } from "../_shared/og-image.ts";

const SOCIAL_META_BLOCK = /<!-- social-meta:start -->[\s\S]*?<!-- social-meta:end -->/;
const TRAILING_SLASH = /\/$/;
const REPORT_PATH = /^\/report\/([^/]+)\/?$/;
const ORG_PATH = /^\/orgs\/([^/]+)\/?$/;

function escapeAttribute(value: string): string {
  return value.replace(/[&<>"']/g, (character) => {
    switch (character) {
      case "&":
        return "&amp;";
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case '"':
        return "&quot;";
      default:
        return "&#39;";
    }
  });
}

export function reportSocialMeta(requestUrl: URL): string {
  const canonicalUrl = new URL(requestUrl.pathname, requestUrl.origin).toString();
  const reportTarget = REPORT_PATH.exec(requestUrl.pathname)?.[1];
  const orgTarget = ORG_PATH.exec(requestUrl.pathname)?.[1];
  const imagePath = orgTarget ? `/og/orgs/${orgTarget}` : `/og/report/${reportTarget ?? ""}`;
  const imageUrl = new URL(imagePath.replace(TRAILING_SLASH, ""), requestUrl.origin);
  const title = "npm supply-chain audit report";
  const description = "A read-only npm supply-chain audit snapshot on npm.report.";

  return [
    `<link rel="canonical" href="${escapeAttribute(canonicalUrl)}" />`,
    `<meta property="og:type" content="website" />`,
    `<meta property="og:site_name" content="npm.report" />`,
    `<meta property="og:title" content="${escapeAttribute(title)}" />`,
    `<meta property="og:description" content="${escapeAttribute(description)}" />`,
    `<meta property="og:url" content="${escapeAttribute(canonicalUrl)}" />`,
    `<meta property="og:image" content="${escapeAttribute(imageUrl.toString())}" />`,
    `<meta property="og:image:type" content="image/png" />`,
    `<meta property="og:image:width" content="${OG_WIDTH}" />`,
    `<meta property="og:image:height" content="${OG_HEIGHT}" />`,
    `<meta property="og:image:alt" content="npm.report audit report" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:title" content="${escapeAttribute(title)}" />`,
    `<meta name="twitter:description" content="${escapeAttribute(description)}" />`,
    `<meta name="twitter:image" content="${escapeAttribute(imageUrl.toString())}" />`,
    `<meta name="twitter:image:alt" content="npm.report audit report" />`,
  ].join("\n    ");
}

export function injectReportSocialMeta(html: string, requestUrl: URL): string {
  return html.replace(SOCIAL_META_BLOCK, reportSocialMeta(requestUrl));
}

export default async (request: Request, context: Context): Promise<Response> => {
  const response = await context.next();
  if (!response.ok || !response.headers.get("content-type")?.includes("text/html")) return response;

  const html = injectReportSocialMeta(await response.text(), new URL(request.url));
  const headers = new Headers(response.headers);
  headers.delete("content-length");
  headers.delete("content-encoding");
  headers.delete("etag");

  return new Response(html, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
};

export const config: Config = {
  path: ["/report/:id", "/orgs/:orgs"],
};
