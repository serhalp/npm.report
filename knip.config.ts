import type { KnipConfig } from "knip";

export default {
  entry: ["a11y.e2e.ts", "netlify/functions/**/*.ts", "netlify/edge-functions/**/*.ts"],
  project: ["src/**/*.{ts,svelte}", "netlify/**/*.ts", "*.ts"],
  ignoreDependencies: [
    // Used only via the `svelte-check --tsgo` flag (the tsgo typechecker), so
    // knip can't see it referenced in source and reports a false positive.
    "@typescript/native-preview",
  ],
  ignoreExportsUsedInFile: true,
} satisfies KnipConfig;
