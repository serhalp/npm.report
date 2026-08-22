<script lang="ts">
  import type { ReportTrustHistoryPoint } from "../lib/reportHistory";
  import type { TrustLevel } from "../lib/types";

  interface Props {
    point: ReportTrustHistoryPoint;
  }

  const LEVELS: { key: TrustLevel; label: string; className: string }[] = [
    { key: "stagedPublish", label: "Staged publish", className: "history-segment--staged" },
    { key: "trustedPublisher", label: "Trusted publisher", className: "history-segment--trusted" },
    { key: "provenance", label: "Provenance only", className: "history-segment--provenance" },
    { key: "none", label: "No trust signal", className: "history-segment--none" },
  ];

  let { point }: Props = $props();
  let activeLevel = $state<TrustLevel | null>(null);

  function percentage(level: TrustLevel): number {
    return point.total > 0 ? (point.byLevel[level] / point.total) * 100 : 0;
  }

  function formatPercentage(value: number): string {
    return value.toFixed(value % 1 === 0 ? 0 : 1);
  }

  function segmentWidth(level: TrustLevel): string {
    return `width: ${percentage(level)}%`;
  }

  function segmentMidpoint(level: TrustLevel): number {
    let offset = 0;
    for (const entry of LEVELS) {
      if (entry.key === level) return offset + percentage(level) / 2;
      offset += percentage(entry.key);
    }
    return 0;
  }

  function segmentLabel(level: (typeof LEVELS)[number]): string {
    return `${level.label}: ${point.byLevel[level.key]} (${formatPercentage(percentage(level.key))}%)`;
  }

  let active = $derived(LEVELS.find((level) => level.key === activeLevel) ?? null);
  let stackLabel = $derived(
    [
      `${new Date(point.capturedAt).toISOString().slice(0, 10)} trust summary`,
      ...LEVELS.map((level) => `${point.byLevel[level.key]} ${level.label.toLowerCase()}`),
    ].join(", "),
  );
</script>

<div class="history-stack-wrap">
  <div
    class="history-stack"
    role="group"
    aria-label={stackLabel}
    onpointerleave={() => (activeLevel = null)}
  >
    {#each LEVELS as level (level.key)}
      <span
        class={level.className}
        role="img"
        aria-label={segmentLabel(level)}
        style={segmentWidth(level.key)}
        onpointerenter={() => (activeLevel = level.key)}
      ></span>
    {/each}
  </div>
  {#if active}
    <span
      class="history-stack-tooltip"
      role="tooltip"
      style={`--history-tooltip-x: ${segmentMidpoint(active.key)}%`}
    >
      <span class={`history-stack-tooltip__swatch ${active.className}`} aria-hidden="true"></span>
      <span>{active.label}</span>
      <strong>{point.byLevel[active.key]}</strong>
      <span class="muted">({formatPercentage(percentage(active.key))}%)</span>
    </span>
  {/if}
</div>
