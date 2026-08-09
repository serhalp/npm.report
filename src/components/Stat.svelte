<script lang="ts">
  import Sparkline from "./Sparkline.svelte";

  interface Props {
    k: string;
    v: string | number;
    sub?: string;
    variant?: "accent" | "risk";
    /** Optional trend series — renders a sparkline under the value. */
    spark?: number[];
    /** Optional [start, end] x-axis labels for the sparkline. */
    sparkLabels?: [string, string];
  }

  let { k, v, sub, variant, spark, sparkLabels }: Props = $props();
</script>

<div class={`stat${variant ? ` stat--${variant}` : ""}`}>
  <div class="k">{k}</div>
  <div class="v">
    {typeof v === "number" ? v.toLocaleString() : v}
    {#if sub}
      <small> {sub}</small>
    {/if}
  </div>
  {#if spark && spark.length > 1}
    <Sparkline values={spark} labels={sparkLabels} />
  {/if}
</div>
