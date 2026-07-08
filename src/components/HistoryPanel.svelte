<script lang="ts">
  import Stat from "./Stat.svelte";
  import type { ReportHistoryResponse, ReportTrustHistoryPoint } from "../lib/reportHistory";
  import { parseOrNull, ReportHistoryResponseSchema } from "../lib/schemas";
  import type { TrustLevel } from "../lib/types";

  interface Props {
    orgs: string[];
    enabled?: boolean;
    currentReportId?: string | null;
    refreshKey?: number;
  }

  const LEVELS: { key: TrustLevel; label: string; className: string }[] = [
    { key: "stagedPublish", label: "Staged", className: "history-segment--staged" },
    { key: "trustedPublisher", label: "Trusted publisher", className: "history-segment--trusted" },
    { key: "provenance", label: "Provenance", className: "history-segment--provenance" },
    { key: "none", label: "No trust signal", className: "history-segment--none" },
  ];

  let { orgs, enabled = true, currentReportId = null, refreshKey = 0 }: Props = $props();

  let response = $state<ReportHistoryResponse | null>(null);
  let loading = $state(false);

  let cleanOrgs = $derived(orgs.map((org) => org.trim()).filter(Boolean));
  let points = $derived(response?.points ?? []);
  let first = $derived(points[0] ?? null);
  let latest = $derived(points.at(-1) ?? null);

  function formatDay(value: string): string {
    return new Date(value).toISOString().slice(0, 10);
  }

  function trustedCount(point: ReportTrustHistoryPoint): number {
    return point.total - point.byLevel.none;
  }

  function coverage(point: ReportTrustHistoryPoint | null): number {
    if (!point || point.total <= 0) return 0;
    return (trustedCount(point) / point.total) * 100;
  }

  function formatPercent(value: number): string {
    return `${value.toFixed(value % 1 === 0 ? 0 : 1)}%`;
  }

  function deltaLabel(): string {
    const delta = coverage(latest) - coverage(first);
    if (points.length < 2) return "baseline";
    return `${delta >= 0 ? "+" : ""}${delta.toFixed(1)} pts`;
  }

  function segmentWidth(point: ReportTrustHistoryPoint, level: TrustLevel): string {
    if (point.total <= 0) return "width: 0%";
    return `width: ${(point.byLevel[level] / point.total) * 100}%`;
  }

  function stackLabel(point: ReportTrustHistoryPoint): string {
    return [
      `${formatDay(point.capturedAt)} trust summary`,
      `${point.byLevel.stagedPublish} staged`,
      `${point.byLevel.trustedPublisher} trusted publisher`,
      `${point.byLevel.provenance} provenance only`,
      `${point.byLevel.none} no trust signal`,
    ].join(", ");
  }

  $effect(() => {
    const token = refreshKey;
    if (!enabled || cleanOrgs.length === 0) {
      response = null;
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
        response = {
          orgs: Array.isArray(body.orgs) ? body.orgs : [],
          points: Array.isArray(body.points) ? body.points : [],
        };
      })
      .catch(() => {
        if (!cancelled) {
          response = { orgs: cleanOrgs, points: [] };
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
          <Stat k="Latest coverage" v={formatPercent(coverage(latest))} sub="any trust signal" />
          <Stat k="Change" v={deltaLabel()} sub={`${points.length} snapshot(s)`} />
          <Stat k="Latest failures" v={latest?.failureCount ?? 0} />
        </div>

        <div class="history-legend" aria-label="Trust level legend">
          {#each LEVELS as level (level.key)}
            <span><span class={`history-swatch ${level.className}`}></span>{level.label}</span>
          {/each}
        </div>

        <ol class="history-list">
          {#each points as point (point.id)}
            <li class:current={point.id === currentReportId}>
              <a class="history-date" href={point.url}>{formatDay(point.capturedAt)}</a>
              <div class="history-stack" role="img" aria-label={stackLabel(point)}>
                {#each LEVELS as level (level.key)}
                  <span class={level.className} style={segmentWidth(point, level.key)}></span>
                {/each}
              </div>
              <span class="history-total">
                {trustedCount(point)}/{point.total}
                <span class="muted">trusted</span>
              </span>
            </li>
          {/each}
        </ol>
      {/if}
    </div>
  </section>
{/if}
