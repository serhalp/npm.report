import { svelte } from "@sveltejs/vite-plugin-svelte";
import netlify from "@netlify/vite-plugin";
import Sonda from "sonda/vite";
import { defineConfig } from "vitest/config";

const analyzeBundle = process.env.SONDA === "true";

// Netlify's Vite plugin emulates the platform locally, exposing the /api/*
// surface for the audit-stream SSE endpoints, report links, and daily tracking.
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
  },
  resolve: process.env.VITEST
    ? {
        conditions: ["browser"],
      }
    : undefined,
  test: {
    environment: "jsdom",
    environmentOptions: {
      jsdom: {
        url: "http://localhost:3000/",
      },
    },
    setupFiles: ["src/test/setup.ts"],
    include: [
      "src/**/*.{test,spec}.ts",
      "src/**/*.{test,spec}.svelte.ts",
      "db/**/*.{test,spec}.ts",
      "netlify/**/*.{test,spec}.ts",
    ],
    coverage: {
      provider: "v8",
      reporter: ["text", "json-summary", "json", "html"],
      reportOnFailure: true,
      include: ["src/**/*.{ts,svelte}", "db/**/*.ts", "netlify/**/*.ts"],
      exclude: [
        "src/**/*.{test,spec}.ts",
        "src/**/*.{test,spec}.svelte.ts",
        "src/test/**",
        "src/vite-env.d.ts",
        "src/lib/types.ts",
        "src/components/dataTableTypes.ts",
        "netlify/database/**",
      ],
    },
    clearMocks: true,
  },
});
