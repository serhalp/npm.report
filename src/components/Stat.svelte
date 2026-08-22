<script lang="ts">
  interface Props {
    k: string;
    v: string | number;
    sub?: string;
    variant?: "accent" | "strong" | "any" | "risk";
  }

  let { k, v, sub, variant }: Props = $props();
</script>

<div class={`stat${variant ? ` stat--${variant}` : ""}`}>
  <div class="k">{k}</div>
  <div class="v">
    {typeof v === "number" ? v.toLocaleString() : v}
    {#if sub}
      <small> {sub}</small>
    {/if}
  </div>
</div>
