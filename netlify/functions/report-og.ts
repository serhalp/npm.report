import type { Config } from "@netlify/functions";
import { readFile } from "node:fs/promises";
import { render } from "takumi-js";
import wasmUrl from "takumi-js/wasm-url";
import type { ReportSocialRow } from "#db/schema";
import { OG_DEVICE_PIXEL_RATIO, OG_HEIGHT, OG_WIDTH } from "#server/og-image";
import { homeCardHtml, OG_CARD_STYLES, OG_LOGO_SOURCE, reportCardHtml } from "#node/og-cards";
import { getReportSocialData } from "#node/report-social";

export { homeCardHtml, reportCardHtml } from "#node/og-cards";

const REPORT_IMAGE_PATH = /^\/og\/report\/([^/]+)$/;
const assets = Promise.all([
  readFile(new URL("../../src/components/logo.svg", import.meta.url)),
  readFile(
    new URL(
      "../../node_modules/@fontsource-variable/ibm-plex-sans/files/ibm-plex-sans-latin-wght-normal.woff2",
      import.meta.url,
    ),
  ),
  readFile(
    new URL(
      "../../node_modules/@fontsource/ibm-plex-mono/files/ibm-plex-mono-latin-400-normal.woff2",
      import.meta.url,
    ),
  ),
  readFile(
    new URL(
      "../../node_modules/@fontsource/ibm-plex-mono/files/ibm-plex-mono-latin-600-normal.woff2",
      import.meta.url,
    ),
  ),
  readFile(wasmUrl),
]);

function reportIdFromUrl(url: URL): string | null {
  const match = REPORT_IMAGE_PATH.exec(url.pathname);
  if (!match?.[1]) return null;
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return null;
  }
}

async function renderCard(html: string): Promise<Uint8Array<ArrayBuffer>> {
  const [logo, plexSans, plexMono400, plexMono600, wasm] = await assets;
  return render(html, {
    width: OG_WIDTH,
    height: OG_HEIGHT,
    devicePixelRatio: OG_DEVICE_PIXEL_RATIO,
    format: "png",
    stylesheets: [OG_CARD_STYLES],
    images: [{ src: OG_LOGO_SOURCE, data: logo }],
    fonts: [
      { name: "IBM Plex Sans", data: plexSans },
      { name: "IBM Plex Mono", data: plexMono400, weight: 400 },
      { name: "IBM Plex Mono", data: plexMono600, weight: 600 },
    ],
    module: wasm,
  });
}

export function renderHomeCard(): Promise<Uint8Array<ArrayBuffer>> {
  return renderCard(homeCardHtml());
}

export function renderReportCard(report: ReportSocialRow): Promise<Uint8Array<ArrayBuffer>> {
  return renderCard(reportCardHtml(report));
}

export default async (request: Request): Promise<Response> => {
  if (request.method !== "GET") return new Response("Method not allowed", { status: 405 });

  const id = reportIdFromUrl(new URL(request.url));
  if (!id) return new Response("Not found", { status: 404 });

  const report = await getReportSocialData(id);
  if (!report) return new Response("Not found", { status: 404 });

  const image = await renderReportCard(report);

  return new Response(image, {
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "public, max-age=0, must-revalidate",
      "Netlify-CDN-Cache-Control": "public, durable, max-age=86400, stale-while-revalidate=604800",
    },
  });
};

export const config: Config = {
  path: "/og/report/:id",
};
