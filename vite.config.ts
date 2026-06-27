import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import netlify from "@netlify/vite-plugin";
import Sonda from "sonda/vite";

const analyzeBundle = process.env.SONDA === "true";

// The audit runs entirely client-side (all three npm APIs send
// `access-control-allow-origin: *`), so this is a pure static SPA — no
// serverless functions, no timeouts, no response-size caps. ghostty-web
// inlines its WASM as a base64 data URL in the ESM build, so no special
// asset handling is required.
export default defineConfig({
  plugins: [
    react(),
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
});
