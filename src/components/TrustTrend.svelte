<script lang="ts">
  import {
    anyTrustCount,
    strongTrustCount,
    trustPercent,
    type ReportTrustHistoryPoint,
  } from "../lib/reportHistory";
  import { spacedTrendDateIndices, trendDateCandidates } from "../lib/trustTrend";

  interface Props {
    points: ReportTrustHistoryPoint[];
    currentReportId?: string | null;
    linkReports?: boolean;
  }

  let { points, currentReportId = null, linkReports = false }: Props = $props();
  let activeIndex = $state<number | null>(null);
  let keyboardIndex = $state<number | null>(null);

  // Fixed 0–100 y-scale keeps histories comparable. X positions follow actual
  // capture times, so missing days do not look adjacent.
  const W = 720;
  const H = 192;
  const PAD_LEFT = 42;
  const PAD_RIGHT = 10;
  const PAD_TOP = 26;
  const PAD_BOTTOM = 36;
  const PLOT_BOTTOM = H - PAD_BOTTOM;
  const DATE_LABEL_SPACING = 52;

  function timestampAt(index: number): number {
    const parsed = Date.parse(points[index]?.capturedAt ?? "");
    return Number.isFinite(parsed) ? parsed : index;
  }

  function xAt(index: number): number {
    if (points.length <= 1) return PAD_LEFT;
    const first = timestampAt(0);
    const last = timestampAt(points.length - 1);
    if (last <= first) {
      return PAD_LEFT + (index / (points.length - 1)) * (W - PAD_LEFT - PAD_RIGHT);
    }
    return PAD_LEFT + ((timestampAt(index) - first) / (last - first)) * (W - PAD_LEFT - PAD_RIGHT);
  }

  const yAt = (pct: number): number => PAD_TOP + (1 - pct / 100) * (PLOT_BOTTOM - PAD_TOP);

  const seriesOf = (count: (p: ReportTrustHistoryPoint) => number): number[] =>
    points.map((p) => trustPercent(count(p), p.total));
  const linePoints = (values: number[]): string =>
    values.map((value, index) => `${xAt(index).toFixed(1)},${yAt(value).toFixed(1)}`).join(" ");

  function shortDay(index: number): string {
    return new Date(points[index].capturedAt).toISOString().slice(5, 10);
  }

  function fullDay(index: number): string {
    return new Date(points[index].capturedAt).toISOString().slice(0, 10);
  }

  function formatPercent(value: number): string {
    return `${value.toFixed(value % 1 === 0 ? 0 : 1)}%`;
  }

  function targetStyle(index: number): string {
    const x = xAt(index);
    const left = index === 0 ? PAD_LEFT : (xAt(index - 1) + x) / 2;
    const right = index === points.length - 1 ? W - PAD_RIGHT : (x + xAt(index + 1)) / 2;
    return [
      `left: ${(left / W) * 100}%`,
      `width: ${((right - left) / W) * 100}%`,
      `top: ${(PAD_TOP / H) * 100}%`,
      `height: ${((PLOT_BOTTOM - PAD_TOP) / H) * 100}%`,
    ].join("; ");
  }

  function tooltipPosition(index: number): string {
    return `--trend-tooltip-x: ${(xAt(index) / W) * 100}%`;
  }

  function tooltipAlignment(index: number): "start" | "middle" | "end" {
    const ratio = xAt(index) / W;
    if (ratio < 0.25) return "start";
    if (ratio > 0.75) return "end";
    return "middle";
  }

  function reportLabel(index: number): string {
    const point = points[index];
    return [
      `${fullDay(index)} report`,
      `${strongTrustCount(point)} of ${point.total} strong trust`,
      `${anyTrustCount(point)} of ${point.total} any trust`,
      `${point.byLevel.none} of ${point.total} no trust signal`,
      point.id === currentReportId ? "currently viewing" : null,
    ]
      .filter(Boolean)
      .join(", ");
  }

  function prioritizeDateLabel(indices: number[], prioritizedIndex: number): number[] {
    const prioritizedX = xAt(prioritizedIndex);
    return [
      ...indices.filter(
        (index) =>
          index === prioritizedIndex || Math.abs(xAt(index) - prioritizedX) >= DATE_LABEL_SPACING,
      ),
      ...(indices.includes(prioritizedIndex) ? [] : [prioritizedIndex]),
    ].toSorted((left, right) => left - right);
  }

  function handleTargetKeydown(event: KeyboardEvent, index: number): void {
    if (event.key === "Escape") {
      activeIndex = null;
      return;
    }

    let nextIndex: number | null = null;
    if (event.key === "ArrowRight") nextIndex = (index + 1) % points.length;
    else if (event.key === "ArrowLeft") nextIndex = (index - 1 + points.length) % points.length;
    else if (event.key === "Home") nextIndex = 0;
    else if (event.key === "End") nextIndex = points.length - 1;

    if (nextIndex === null || nextIndex === index) return;
    event.preventDefault();
    keyboardIndex = nextIndex;
    activeIndex = nextIndex;
    const targets = (event.currentTarget as HTMLAnchorElement)
      .closest(".trust-trend__targets")
      ?.querySelectorAll<HTMLAnchorElement>(".trust-trend__target");
    targets?.[nextIndex]?.focus();
  }

  function handleWindowKeydown(event: KeyboardEvent): void {
    if (event.key === "Escape") activeIndex = null;
  }

  let strong = $derived(seriesOf(strongTrustCount));
  let any = $derived(seriesOf(anyTrustCount));
  let none = $derived(seriesOf((point) => point.byLevel.none));
  let latestStrong = $derived(strong.at(-1) ?? 0);
  let latestAny = $derived(any.at(-1) ?? 0);
  let latestNone = $derived(none.at(-1) ?? 0);
  let currentIndex = $derived(points.findIndex((point) => point.id === currentReportId));
  let showCurrentIndicator = $derived(currentIndex >= 0 && currentIndex < points.length - 1);
  let showCurrentLabel = $derived(showCurrentIndicator && activeIndex === currentIndex);
  let dateCandidates = $derived(trendDateCandidates(points));
  let spacedDateLabelIndices = $derived(
    spacedTrendDateIndices(dateCandidates, xAt, DATE_LABEL_SPACING),
  );
  let dateLabelIndices = $derived(
    showCurrentIndicator
      ? prioritizeDateLabel(spacedDateLabelIndices, currentIndex)
      : spacedDateLabelIndices,
  );
  let preferredKeyboardIndex = $derived(
    currentIndex >= 0 ? currentIndex : Math.max(0, points.length - 1),
  );
  let tabStopIndex = $derived(keyboardIndex ?? preferredKeyboardIndex);

  let label = $derived(
    `Trust coverage across ${points.length} snapshots. Latest: ` +
      `${latestStrong.toFixed(0)}% strong trust, ${latestAny.toFixed(0)}% any trust, ` +
      `${latestNone.toFixed(0)}% no trust signal.` +
      (currentIndex >= 0 ? ` Viewing ${fullDay(currentIndex)}.` : ""),
  );
</script>

<svelte:window onkeydown={handleWindowKeydown} />

<figure class="trust-trend" style={`--trend-plot-top: ${(PAD_TOP / H) * 100}%`}>
  <figcaption class="trust-trend__legend">
    <span class="trust-trend__key trust-trend__key--strong">Strong trust</span>
    <span class="trust-trend__key trust-trend__key--any">Any trust</span>
    <span class="trust-trend__key trust-trend__key--none">No trust signal</span>
  </figcaption>

  <div class="trust-trend__viewport">
    <div class="trust-trend__plot">
      <svg class="trust-trend__svg" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label}>
        {#each [0, 50, 100] as gridline (gridline)}
          <line
            class="trust-trend__grid"
            x1={PAD_LEFT}
            x2={W - PAD_RIGHT}
            y1={yAt(gridline)}
            y2={yAt(gridline)}
          />
          <text
            class="trust-trend__axis-label trust-trend__axis-label--y"
            x={PAD_LEFT - 8}
            y={yAt(gridline) + 3}
            text-anchor="end">{gridline}%</text
          >
        {/each}

        {#each dateLabelIndices as index (index)}
          <line
            class="trust-trend__tick"
            class:trust-trend__tick--current={showCurrentIndicator && index === currentIndex}
            x1={xAt(index)}
            x2={xAt(index)}
            y1={PLOT_BOTTOM}
            y2={PLOT_BOTTOM + 5}
          />
        {/each}

        {#each dateLabelIndices as index (index)}
          <text
            class="trust-trend__axis-label trust-trend__axis-label--x"
            class:trust-trend__axis-label--current={showCurrentIndicator && index === currentIndex}
            x={xAt(index)}
            y={PLOT_BOTTOM + 19}
            text-anchor={index === 0 ? "start" : index === points.length - 1 ? "end" : "middle"}
            >{shortDay(index)}{#if showCurrentLabel && index === currentIndex}<tspan
                class="trust-trend__current-label"
                x={xAt(index)}
                dy="12">[viewing]</tspan
              >{/if}</text
          >
        {/each}

        <polyline class="trust-trend__line trust-trend__line--none" points={linePoints(none)} />
        <polyline class="trust-trend__line trust-trend__line--any" points={linePoints(any)} />
        <polyline class="trust-trend__line trust-trend__line--strong" points={linePoints(strong)} />

        {#if activeIndex !== null}
          <line
            class="trust-trend__hover-line"
            x1={xAt(activeIndex)}
            x2={xAt(activeIndex)}
            y1={PAD_TOP}
            y2={PLOT_BOTTOM}
          />
          <circle
            class="trust-trend__dot trust-trend__dot--none"
            cx={xAt(activeIndex)}
            cy={yAt(none[activeIndex])}
            r="3.5"
          />
          <circle
            class="trust-trend__dot trust-trend__dot--any"
            cx={xAt(activeIndex)}
            cy={yAt(any[activeIndex])}
            r="3.5"
          />
          <circle
            class="trust-trend__dot trust-trend__dot--strong"
            cx={xAt(activeIndex)}
            cy={yAt(strong[activeIndex])}
            r="3.5"
          />
        {/if}
      </svg>

      {#if linkReports}
        <div class="trust-trend__targets" role="group" aria-label="Report snapshots">
          {#each points as point, index (point.id)}
            <a
              class="trust-trend__target"
              href={point.url}
              style={targetStyle(index)}
              aria-label={reportLabel(index)}
              aria-current={point.id === currentReportId ? "page" : undefined}
              tabindex={index === tabStopIndex ? 0 : -1}
              onpointerenter={() => (activeIndex = index)}
              onpointerleave={() => (activeIndex = null)}
              onfocus={() => {
                keyboardIndex = index;
                activeIndex = index;
              }}
              onblur={() => (activeIndex = null)}
              onkeydown={(event) => handleTargetKeydown(event, index)}
            ></a>
          {/each}
        </div>
      {/if}

      {#if activeIndex !== null}
        {@const point = points[activeIndex]}
        <div
          class={`trust-trend__tooltip trust-trend__tooltip--${tooltipAlignment(activeIndex)}`}
          role="tooltip"
          style={tooltipPosition(activeIndex)}
        >
          <div class="trust-trend__tooltip-head">
            <strong>{fullDay(activeIndex)}</strong>
          </div>
          <dl>
            <div>
              <dt class="trust-trend__key trust-trend__key--strong">Strong trust</dt>
              <dd>
                {strongTrustCount(point)}/{point.total} · {formatPercent(strong[activeIndex])}
              </dd>
            </div>
            <div>
              <dt class="trust-trend__key trust-trend__key--any">Any trust</dt>
              <dd>{anyTrustCount(point)}/{point.total} · {formatPercent(any[activeIndex])}</dd>
            </div>
            <div>
              <dt class="trust-trend__key trust-trend__key--none">No trust signal</dt>
              <dd>{point.byLevel.none}/{point.total} · {formatPercent(none[activeIndex])}</dd>
            </div>
          </dl>
        </div>
      {/if}
    </div>
  </div>
</figure>
