<script lang="ts">
  import {
    anyTrustCount,
    strongTrustCount,
    trustPercent,
    type ReportTrustHistoryPoint,
  } from "../lib/reportHistory";

  interface Props {
    points: ReportTrustHistoryPoint[];
  }

  let { points }: Props = $props();

  // A plain inline SVG line chart — no dependency, no canvas, CSP-safe, theme
  // tokens for color. Fixed 0–100 y-scale (honest: a flat high line reads as
  // "consistently high", not exaggerated), x by snapshot index. The viewBox
  // scales with the container; strokes stay crisp via vector-effect (CSS).
  const W = 640;
  const H = 150;
  const PAD_X = 8;
  const PAD_Y = 10;

  const xAt = (i: number, n: number): number =>
    n <= 1 ? PAD_X : PAD_X + (i / (n - 1)) * (W - 2 * PAD_X);
  const yAt = (pct: number): number => PAD_Y + (1 - pct / 100) * (H - 2 * PAD_Y);

  const seriesOf = (count: (p: ReportTrustHistoryPoint) => number): number[] =>
    points.map((p) => trustPercent(count(p), p.total));
  const linePoints = (values: number[]): string =>
    values.map((v, i) => `${xAt(i, values.length).toFixed(1)},${yAt(v).toFixed(1)}`).join(" ");

  let strong = $derived(seriesOf(strongTrustCount));
  let any = $derived(seriesOf(anyTrustCount));
  let latestStrong = $derived(strong.at(-1) ?? 0);
  let latestAny = $derived(any.at(-1) ?? 0);

  let label = $derived(
    `Strong trust and any-trust-signal across ${points.length} snapshots — latest ` +
      `${latestStrong.toFixed(0)}% strong, ${latestAny.toFixed(0)}% any trust.`,
  );
</script>

<figure class="trust-trend">
  <svg class="trust-trend__svg" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label}>
    {#each [0, 50, 100] as gridline (gridline)}
      <line
        class="trust-trend__grid"
        x1={PAD_X}
        x2={W - PAD_X}
        y1={yAt(gridline)}
        y2={yAt(gridline)}
      />
    {/each}
    <polyline class="trust-trend__line trust-trend__line--any" points={linePoints(any)} />
    <polyline class="trust-trend__line trust-trend__line--strong" points={linePoints(strong)} />
    <circle
      class="trust-trend__dot trust-trend__dot--any"
      cx={xAt(any.length - 1, any.length)}
      cy={yAt(latestAny)}
      r="3"
    />
    <circle
      class="trust-trend__dot trust-trend__dot--strong"
      cx={xAt(strong.length - 1, strong.length)}
      cy={yAt(latestStrong)}
      r="3"
    />
  </svg>
  <figcaption class="trust-trend__legend">
    <span class="trust-trend__key trust-trend__key--strong">Strong trust</span>
    <span class="trust-trend__key trust-trend__key--any">Any trust</span>
  </figcaption>
</figure>
