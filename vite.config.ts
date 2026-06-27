import { svelte } from "@sveltejs/vite-plugin-svelte";
import netlify from "@netlify/vite-plugin";
import Sonda from "sonda/vite";
import { defineConfig } from "vitest/config";

const analyzeBundle = process.env.SONDA === "true";

// The audit orchestration runs in the browser. Netlify's Vite plugin exposes
// the narrow /api/* surface used by the per-host npm edge proxies and the small
// report-sharing function. ghostty-web inlines its WASM as a base64 data URL in
// the ESM build, so no special asset handling is required.
export default defineConfig({
  plugins: [
    svelte(),
    netlify(),
    Sonda({
      enabled: analyzeBundle,
      format: ["html", "json"],
      include: [/^dist\/client\/assets\/.*\.js$/],
      filename: "bundle",
      outputDir: ".sonda",
      open: false,
      gzip: true,
      brotli: true,
    }),
  ],
  build: {
    sourcemap: analyzeBundle,
    target: "es2022",
    // The inlined WASM data URL pushes the ghostty-web chunk well past the
    // default warning size; that's expected.
    chunkSizeWarningLimit: 2048,
  },
  resolve: process.env.VITEST
    ? {
        conditions: ["browser"],
      }
    : undefined,
  test: {
    environment: "jsdom",
    setupFiles: ["src/test/setup.ts"],
    include: ["src/**/*.{test,spec}.ts", "src/**/*.{test,spec}.svelte.ts"],
    clearMocks: true,
  },
});
