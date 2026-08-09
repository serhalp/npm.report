<script lang="ts">
  // Tiny trend chart for a stat tile: one line on a fixed 0–100 scale so tiles stay comparable.
  interface Props {
    values: number[];
    /** Optional [start, end] x-axis labels (e.g. dates). */
    labels?: [string, string];
  }

  let { values, labels }: Props = $props();

  const W = 100;
  const H = 30;
  const PAD = 2;

  const xAt = (i: number, n: number): number =>
    n <= 1 ? W / 2 : PAD + (i / (n - 1)) * (W - 2 * PAD);
  const yAt = (v: number): number => PAD + (1 - v / 100) * (H - 2 * PAD);

  let points = $derived(
    values.map((v, i) => `${xAt(i, values.length).toFixed(1)},${yAt(v).toFixed(1)}`).join(" "),
  );
</script>

<figure class="sparkline">
  <div class="sparkline__plot">
    <div class="sparkline__yaxis" aria-hidden="true">
      <span>100</span>
      <span>0</span>
    </div>
    <svg
      class="sparkline__svg"
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <line class="sparkline__grid" x1="0" x2={W} y1={yAt(50)} y2={yAt(50)} />
      <polyline class="sparkline__line" {points} />
    </svg>
  </div>
  {#if labels}
    <div class="sparkline__xaxis" aria-hidden="true">
      <span>{labels[0]}</span>
      <span>{labels[1]}</span>
    </div>
  {/if}
</figure>
