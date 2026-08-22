<script lang="ts">
  import HistoryStack from "./HistoryStack.svelte";
  import Stat from "./Stat.svelte";
  import TrustTrend from "./TrustTrend.svelte";
  import { groupTrustHistoryPoints } from "../lib/historyGroups";
  import {
    anyTrustCount,
    strongTrustCount,
    trustPercent,
    type ReportHistoryResponse,
    type ReportTrustHistoryPoint,
  } from "../lib/reportHistory";
  import { parseOrNull, ReportHistoryResponseSchema } from "../lib/schemas";
  import type { TrustLevel } from "../lib/types";

  interface Props {
    orgs: string[];
    enabled?: boolean;
    currentReportId?: string | null;
    refreshKey?: number;
    preloadedHistory?: ReportHistoryResponse;
  }

  const LEVELS: { key: TrustLevel; label: string; className: string }[] = [
    { key: "stagedPublish", label: "Staged", className: "history-segment--staged" },
    { key: "trustedPublisher", label: "Trusted publisher", className: "history-segment--trusted" },
    { key: "provenance", label: "Provenance", className: "history-segment--provenance" },
    { key: "none", label: "No trust signal", className: "history-segment--none" },
  ];

  let {
    orgs,
    enabled = true,
    currentReportId = null,
    refreshKey = 0,
    preloadedHistory,
  }: Props = $props();

  let fetchedHistory = $state<ReportHistoryResponse | null>(null);
  let loading = $state(false);

  let cleanOrgs = $derived(orgs.map((org) => org.trim()).filter(Boolean));
  let response = $derived(preloadedHistory ?? fetchedHistory);
  let points = $derived(response?.points ?? []);
  let pointGroups = $derived(groupTrustHistoryPoints(points).toReversed());
  let latest = $derived(points.at(-1) ?? null);

  function formatDay(value: string): string {
    return new Date(value).toISOString().slice(0, 10);
  }

  function formatPercent(value: number): string {
    return `${value.toFixed(value % 1 === 0 ? 0 : 1)}%`;
  }

  function pctCount(count: number, total: number): string {
    return `${formatPercent(trustPercent(count, total))} (${count})`;
  }
  let latestStrong = $derived(latest ? pctCount(strongTrustCount(latest), latest.total) : "—");
  let latestAny = $derived(latest ? pctCount(anyTrustCount(latest), latest.total) : "—");
  let latestNone = $derived(latest ? pctCount(latest.byLevel.none, latest.total) : "—");

  // Per-tile trend series (percent over time) and shared x-axis endpoint dates.
  // Stat only draws the sparkline when a series has >1 point.
  let strongSeries = $derived(points.map((p) => trustPercent(strongTrustCount(p), p.total)));
  let anySeries = $derived(points.map((p) => trustPercent(anyTrustCount(p), p.total)));
  let noneSeries = $derived(points.map((p) => trustPercent(p.byLevel.none, p.total)));
  let sparkLabels = $derived<[string, string] | undefined>(
    points.length > 1
      ? [formatDay(points[0].capturedAt).slice(5), formatDay(points.at(-1)!.capturedAt).slice(5)]
      : undefined,
  );

  function containsCurrentReport(pointsInGroup: ReportTrustHistoryPoint[]): boolean {
    return pointsInGroup.some((point) => point.id === currentReportId);
  }

  $effect(() => {
    const token = refreshKey;
    if (!enabled || cleanOrgs.length === 0) {
      fetchedHistory = null;
      loading = false;
      return;
    }
    if (preloadedHistory !== undefined) {
      fetchedHistory = null;
      loading = false;
      return;
    }

    const params = new URLSearchParams();
    for (const org of cleanOrgs) params.append("org", org);

    let cancelled = false;
    loading = true;

    fetch(`/api/reports/history?${params}`)
      .then(async (next) => {
        if (!next.ok) return { orgs: cleanOrgs, points: [] };
        const data = await next.json();
        return parseOrNull(ReportHistoryResponseSchema, data)
          ? (data as ReportHistoryResponse)
          : { orgs: cleanOrgs, points: [] };
      })
      .then((body) => {
        if (cancelled || token !== refreshKey) return;
        fetchedHistory = {
          orgs: Array.isArray(body.orgs) ? body.orgs : [],
          points: Array.isArray(body.points) ? body.points : [],
        };
      })
      .catch(() => {
        if (!cancelled) {
          fetchedHistory = { orgs: cleanOrgs, points: [] };
        }
      })
      .finally(() => {
        if (!cancelled) loading = false;
      });

    return () => {
      cancelled = true;
    };
  });
</script>

{#if enabled && cleanOrgs.length > 0}
  <section class="panel history-panel" aria-labelledby="history-title">
    <div class="panel__head">
      <h2 id="history-title">Progress over time</h2>
      <span class="hint">ALL org packages</span>
    </div>
    <div class="panel__body">
      <p class="desc history-copy">
        Public trust history from saved package trust level reports for this exact org set.
      </p>

      {#if loading}
        <p class="desc history-loading">Loading history…</p>
      {:else if points.length === 0}
        <div class="empty history-empty">
          <div class="big">No history yet</div>
          Run an all-packages trust report for this org set to start the timeline.
        </div>
      {:else}
        <div class="statgrid history-stats">
          <Stat
            k="Strong trust"
            v={latestStrong}
            sub="staged or trusted"
            variant="accent"
            spark={strongSeries}
            {sparkLabels}
          />
          <Stat
            k="Any trust"
            v={latestAny}
            sub="incl. provenance"
            spark={anySeries}
            {sparkLabels}
          />
          <Stat
            k="No trust signal"
            v={latestNone}
            variant="risk"
            spark={noneSeries}
            {sparkLabels}
          />
          <Stat k="Latest failures" v={latest?.failureCount ?? 0} />
        </div>

        {#if points.length > 1}
          <TrustTrend {points} />
        {/if}

        <div class="history-legend" aria-label="Trust level legend">
          {#each LEVELS as level (level.key)}
            <span><span class={`history-swatch ${level.className}`}></span>{level.label}</span>
          {/each}
        </div>

        <ol class="history-list">
          {#each pointGroups as group (group.start.id)}
            {@const point = group.end}
            {#if group.points.length === 1}
              <li class:current={point.id === currentReportId}>
                <div class="history-date-cell">
                  <a
                    class="history-date"
                    href={point.url}
                    aria-current={point.id === currentReportId ? "page" : undefined}
                    >{formatDay(point.capturedAt)}</a
                  >
                  {#if point.id === currentReportId}
                    <span class="history-viewing">[viewing]</span>
                  {/if}
                </div>
                <HistoryStack {point} />
                <span class="history-total">
                  {anyTrustCount(point)}/{point.total}
                  <span class="muted">any trust</span>
                </span>
              </li>
            {:else}
              <li class="history-range" class:current={containsCurrentReport(group.points)}>
                <details>
                  <summary>
                    <span class="history-range__summary">
                      <span class="history-date history-range__date">
                        {formatDay(group.start.capturedAt)}...{formatDay(group.end.capturedAt)}
                        {#if containsCurrentReport(group.points)}
                          <span class="history-viewing">[viewing]</span>
                        {/if}
                      </span>
                      <HistoryStack {point} />
                      <span class="history-total">
                        {anyTrustCount(point)}/{point.total}
                        <span class="muted">any trust</span>
                      </span>
                    </span>
                  </summary>
                  <ol class="history-range__reports">
                    {#each group.points.toReversed() as groupedPoint (groupedPoint.id)}
                      <li class:current={groupedPoint.id === currentReportId}>
                        <a
                          class="history-date"
                          href={groupedPoint.url}
                          aria-current={groupedPoint.id === currentReportId ? "page" : undefined}
                          >{formatDay(groupedPoint.capturedAt)}</a
                        >
                        {#if groupedPoint.id === currentReportId}
                          <span class="history-viewing">[viewing]</span>
                        {/if}
                      </li>
                    {/each}
                  </ol>
                </details>
              </li>
            {/if}
          {/each}
        </ol>
      {/if}
    </div>
  </section>
{/if}
