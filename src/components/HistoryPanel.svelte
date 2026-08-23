<script lang="ts">
  import { TriangleAlert } from "@lucide/svelte";
  import HistoryStack from "./HistoryStack.svelte";
  import Stat from "./Stat.svelte";
  import TrustTrend from "./TrustTrend.svelte";
  import { formatDate, formatDateTime } from "../lib/dateFormatting";
  import { groupTrustHistoryPoints } from "../lib/historyGroups";
  import {
    anyTrustCount,
    strongTrustCount,
    trustPercent,
    type ReportHistoryResponse,
    type ReportTrustHistoryPoint,
  } from "../lib/reportHistory";
  import { parseOrNull, ReportHistoryResponseSchema } from "../lib/schemas";

  interface Props {
    orgs: string[];
    enabled?: boolean;
    currentReportId?: string | null;
    refreshKey?: number;
    preloadedHistory?: ReportHistoryResponse;
  }

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

  function formatPercent(value: number): string {
    return `${value.toFixed(value % 1 === 0 ? 0 : 1)}%`;
  }

  function pctCount(count: number, total: number): string {
    return `${formatPercent(trustPercent(count, total))} (${count})`;
  }
  let latestStrong = $derived(latest ? pctCount(strongTrustCount(latest), latest.total) : "—");
  let latestAny = $derived(latest ? pctCount(anyTrustCount(latest), latest.total) : "—");
  let latestNone = $derived(latest ? pctCount(latest.byLevel.none, latest.total) : "—");

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
    </div>
    <div class="panel__body">
      {#if loading}
        <p class="desc history-loading" role="status">Loading history…</p>
      {:else if points.length === 0}
        <div class="empty history-empty">
          <div class="big">No history yet</div>
          Run an all-packages trust report for this org set to start the timeline.
        </div>
      {:else}
        {#if latest && latest.failureCount > 0}
          <p class="history-alert" role="alert">
            <TriangleAlert aria-hidden="true" size={17} strokeWidth={2} />
            Latest report had {latest.failureCount} fetch
            {latest.failureCount === 1 ? "failure" : "failures"}; results may be incomplete.
          </p>
        {/if}

        <div class="statgrid trust-summary history-stats">
          <Stat k="Strong trust" v={latestStrong} sub="staged or trusted" variant="strong" />
          <Stat k="Any trust" v={latestAny} sub="incl. provenance" variant="any" />
          <Stat
            k="No trust signal"
            v={latestNone}
            sub="no trust metadata detected"
            variant="risk"
          />
        </div>

        {#if points.length > 1}
          <TrustTrend {points} {currentReportId} linkReports />
        {/if}

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
                    ><time datetime={point.capturedAt} title={formatDateTime(point.capturedAt)}
                      >{formatDate(point.capturedAt)}</time
                    ></a
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
                        <time
                          datetime={group.start.capturedAt}
                          title={formatDateTime(group.start.capturedAt)}
                          >{formatDate(group.start.capturedAt)}</time
                        >...<time
                          datetime={group.end.capturedAt}
                          title={formatDateTime(group.end.capturedAt)}
                          >{formatDate(group.end.capturedAt)}</time
                        >
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
                          ><time
                            datetime={groupedPoint.capturedAt}
                            title={formatDateTime(groupedPoint.capturedAt)}
                            >{formatDate(groupedPoint.capturedAt)}</time
                          ></a
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
