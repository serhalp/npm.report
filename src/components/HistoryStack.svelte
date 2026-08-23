<script lang="ts">
  import { formatDate } from "#client/dateFormatting";
  import type { ReportTrustHistoryPoint } from "#shared/reportHistory";
  import type { TrustLevel } from "#shared/types";

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

  function firstVisibleLevel(): TrustLevel {
    return LEVELS.find((level) => point.byLevel[level.key] > 0)?.key ?? LEVELS[0].key;
  }

  function moveActiveLevel(direction: -1 | 1): void {
    const visibleLevels = LEVELS.filter((level) => point.byLevel[level.key] > 0);
    if (visibleLevels.length === 0) return;

    const currentIndex = visibleLevels.findIndex((level) => level.key === activeLevel);
    const nextIndex =
      currentIndex < 0
        ? direction > 0
          ? 0
          : visibleLevels.length - 1
        : (currentIndex + direction + visibleLevels.length) % visibleLevels.length;
    activeLevel = visibleLevels[nextIndex].key;
  }

  function handleKeydown(event: KeyboardEvent): void {
    if (event.key === "Escape") {
      activeLevel = null;
      return;
    }
    if (event.key === "ArrowRight") {
      event.preventDefault();
      moveActiveLevel(1);
    } else if (event.key === "ArrowLeft") {
      event.preventDefault();
      moveActiveLevel(-1);
    }
  }

  function handleWindowKeydown(event: KeyboardEvent): void {
    if (event.key === "Escape") activeLevel = null;
  }

  let active = $derived(LEVELS.find((level) => level.key === activeLevel) ?? null);
  let stackLabel = $derived(
    [
      `${formatDate(point.capturedAt)} trust summary`,
      ...LEVELS.map((level) => `${point.byLevel[level.key]} ${level.label.toLowerCase()}`),
    ].join(", "),
  );
</script>

<svelte:window onkeydown={handleWindowKeydown} />

<div
  class="history-stack-wrap"
  role="group"
  aria-label="Trust breakdown"
  onpointerleave={() => (activeLevel = null)}
>
  <button
    type="button"
    class="history-stack"
    aria-label={stackLabel}
    onfocus={() => (activeLevel = activeLevel ?? firstVisibleLevel())}
    onblur={() => (activeLevel = null)}
    onkeydown={handleKeydown}
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
  </button>
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
