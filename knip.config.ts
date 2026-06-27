import type { KnipConfig } from "knip";

export default {
  entry: ["a11y.e2e.ts", "netlify/functions/**/*.ts", "netlify/edge-functions/**/*.ts"],
  project: ["src/**/*.{ts,svelte}", "netlify/**/*.ts", "*.ts"],
  ignoreDependencies: [
    // Loaded by Netlify Database integration at runtime even though app code
    // reaches it through drizzle-orm/netlify-db.
    "@netlify/database",
  ],
  ignoreExportsUsedInFile: true,
} satisfies KnipConfig;
