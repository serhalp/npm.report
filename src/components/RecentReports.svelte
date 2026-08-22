<script lang="ts">
  import type { RecentTrustReportLink, RecentTrustReportsResponse } from "../lib/reportHistory";
  import { parseOrNull, RecentTrustReportsResponseSchema } from "../lib/schemas";

  let reports = $state<RecentTrustReportLink[]>([]);
  let loading = $state(true);

  function orgLabel(orgs: string[]): string {
    return orgs.length ? orgs.join(", ") : "npm packages";
  }

  function formatDay(value: string): string {
    return new Date(value).toISOString().slice(0, 10);
  }

  $effect(() => {
    let cancelled = false;
    loading = true;

    fetch("/api/reports/recent")
      .then(async (response) => {
        if (!response.ok) return { reports: [] };
        const data = await response.json();
        return parseOrNull(RecentTrustReportsResponseSchema, data)
          ? (data as RecentTrustReportsResponse)
          : { reports: [] };
      })
      .then((body) => {
        if (!cancelled) reports = Array.isArray(body.reports) ? body.reports : [];
      })
      .catch(() => {
        if (!cancelled) reports = [];
      })
      .finally(() => {
        if (!cancelled) loading = false;
      });

    return () => {
      cancelled = true;
    };
  });
</script>

<section class="recent-reports" aria-labelledby="recent-reports-title">
  <div class="recent-reports__head">
    <h2 id="recent-reports-title">Recent reports</h2>
    <span>Latest saved audits</span>
  </div>

  {#if loading}
    <p class="desc" role="status">Loading recent reports…</p>
  {:else if reports.length === 0}
    <p class="desc">No saved reports yet.</p>
  {:else}
    <ol class="recent-reports__list">
      {#each reports as report (report.id)}
        <li>
          <a
            href={report.url}
            aria-label={`${orgLabel(report.orgs)} report from ${formatDay(report.capturedAt)}`}
            >{orgLabel(report.orgs)}</a
          >
          <span>{formatDay(report.capturedAt)}</span>
        </li>
      {/each}
    </ol>
  {/if}
</section>
