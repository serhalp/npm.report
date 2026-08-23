<script lang="ts">
  import Stat from "./Stat.svelte";
  import TrustTrend from "./TrustTrend.svelte";
  import { formatDate } from "../lib/dateFormatting";
  import { EXAMPLE_TRUST_HISTORY_POINTS } from "../lib/exampleTrustHistory.ts";
  import { anyTrustCount, strongTrustCount, trustPercent } from "../lib/reportHistory";
  import type { TrustLevel } from "../lib/types";

  // A static, illustrative report so first-time visitors see what npm.report
  // produces before running one. It reuses the real Stat tiles and trust-level
  // badge classes, so it can't drift from the live look. `@acme/*` names make it
  // unmistakably a sample — we don't assert trust states about real packages.
  const ROWS: {
    pkg: string;
    level: TrustLevel;
    label: string;
    publisher: string;
    downloads: string;
    latest: string;
    deprecated?: boolean;
  }[] = [
    {
      pkg: "@acme/api",
      level: "stagedPublish",
      label: "staged publish",
      publisher: "ci",
      downloads: "1.2m",
      latest: "2026-07-12",
    },
    {
      pkg: "@acme/cli",
      level: "trustedPublisher",
      label: "trusted publisher",
      publisher: "release-bot",
      downloads: "840k",
      latest: "2026-07-09",
    },
    {
      pkg: "@acme/ui",
      level: "provenance",
      label: "provenance",
      publisher: "alice",
      downloads: "410k",
      latest: "2026-06-20",
    },
    {
      pkg: "@acme/utils",
      level: "none",
      label: "none",
      publisher: "bob",
      downloads: "22k",
      latest: "2025-02-11",
    },
    {
      pkg: "acme-legacy",
      level: "none",
      label: "none",
      publisher: "carol",
      downloads: "300",
      latest: "2023-08-02",
      deprecated: true,
    },
  ];

  const LATEST = EXAMPLE_TRUST_HISTORY_POINTS.at(-1)!;

  function pctCount(count: number): string {
    return `${trustPercent(count, LATEST.total).toFixed(0)}% (${count})`;
  }
</script>

<section class="preview" aria-labelledby="preview-tag">
  <div class="preview__head">
    <span class="preview__tag" id="preview-tag">Example report</span>
  </div>

  <div class="statgrid trust-summary preview__stats">
    <Stat
      k="Strong trust"
      v={pctCount(strongTrustCount(LATEST))}
      sub="staged or trusted"
      variant="strong"
    />
    <Stat k="Any trust" v={pctCount(anyTrustCount(LATEST))} sub="incl. provenance" variant="any" />
    <Stat
      k="No trust signal"
      v={pctCount(LATEST.byLevel.none)}
      sub="no trust metadata detected"
      variant="risk"
    />
  </div>
  <p class="preview__trend">Every package owned by acme, tracked daily.</p>
  <TrustTrend points={EXAMPLE_TRUST_HISTORY_POINTS} />

  <div class="preview__frame" aria-hidden="true">
    <table class="preview__table">
      <thead>
        <tr>
          <th>Package</th>
          <th>Trust level</th>
          <th>Publisher</th>
          <th class="num">Downloads/wk</th>
          <th>Latest</th>
        </tr>
      </thead>
      <tbody>
        {#each ROWS as row (row.pkg)}
          <tr>
            <td class="mono">{row.pkg}</td>
            <td>
              <span class={`badge badge--${row.level}`}>{row.label}</span>
              {#if row.deprecated}<span class="flag preview__flag">DEPRECATED</span>{/if}
            </td>
            <td class="mono">{row.publisher}</td>
            <td class="num mono">{row.downloads}</td>
            <td class="mono">{formatDate(row.latest)}</td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>

  <a class="preview__cta" href="#config">Run your own audit ↓</a>
</section>
