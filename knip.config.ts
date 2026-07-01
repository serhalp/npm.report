import type { KnipConfig } from "knip";

export default {
  entry: ["a11y.e2e.ts", "netlify/functions/**/*.ts", "netlify/edge-functions/**/*.ts"],
  project: ["src/**/*.{ts,svelte}", "netlify/**/*.ts", "*.ts"],
  ignoreDependencies: [
    // Loaded by Netlify Database integration at runtime even though app code
    // reaches it through drizzle-orm/netlify-db.
    "@netlify/database",
    // Used only via the `svelte-check --tsgo` flag (the tsgo typechecker), so
    // knip can't see it referenced in source and reports a false positive.
    "@typescript/native-preview",
  ],
  ignoreExportsUsedInFile: true,
} satisfies KnipConfig;
