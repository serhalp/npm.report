<script lang="ts">
  import Stat from "./Stat.svelte";
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
      downloads: "1.2M",
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
</script>

<section class="preview" aria-labelledby="preview-tag">
  <div class="preview__head">
    <span class="preview__tag" id="preview-tag">Example report</span>
  </div>

  <div class="preview__stats">
    <Stat
      k="Strong trust"
      v="40% (24)"
      sub="staged or trusted"
      variant="accent"
      spark={[30, 32, 34, 36, 38, 40]}
      sparkLabels={["07-14", "07-19"]}
    />
    <Stat
      k="Any trust"
      v="65% (39)"
      sub="incl. provenance"
      spark={[58, 60, 61, 63, 64, 65]}
      sparkLabels={["07-14", "07-19"]}
    />
    <Stat
      k="No trust signal"
      v="35% (21)"
      variant="risk"
      spark={[48, 45, 43, 40, 37, 35]}
      sparkLabels={["07-14", "07-19"]}
    />
  </div>
  <p class="preview__trend">Every package owned by acme, tracked daily.</p>

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
            <td class="mono">{row.latest}</td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>

  <a class="preview__cta" href="#config">Run your own audit ↓</a>
</section>
