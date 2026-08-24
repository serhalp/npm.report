<script lang="ts">
  import { formatDate, formatDateTime } from "#client/dateFormatting";
  import type { RecentTrustReportLink, RecentTrustReportsResponse } from "#shared/reportHistory";
  import { parseOrNull, RecentTrustReportsResponseSchema } from "#shared/schemas";

  let reports = $state<RecentTrustReportLink[]>([]);
  let additionalTrackedCount = $state(0);
  let loading = $state(true);

  function orgLabel(orgs: string[]): string {
    return orgs.length ? orgs.join(", ") : "npm packages";
  }

  $effect(() => {
    let cancelled = false;
    loading = true;

    fetch("/api/reports/recent")
      .then(async (response) => {
        if (!response.ok) return { reports: [], additionalTrackedCount: 0 };
        const data = await response.json();
        return parseOrNull(RecentTrustReportsResponseSchema, data)
          ? (data as RecentTrustReportsResponse)
          : { reports: [], additionalTrackedCount: 0 };
      })
      .then((body) => {
        if (!cancelled) {
          reports = body.reports;
          additionalTrackedCount = body.additionalTrackedCount;
        }
      })
      .catch(() => {
        if (!cancelled) {
          reports = [];
          additionalTrackedCount = 0;
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
            aria-label={`${orgLabel(report.orgs)} report from ${formatDate(report.capturedAt)}`}
            >{orgLabel(report.orgs)}</a
          >
          <time datetime={report.capturedAt} title={formatDateTime(report.capturedAt)}
            >{formatDate(report.capturedAt)}</time
          >
        </li>
      {/each}
      {#if additionalTrackedCount > 0}
        <li><a href="/tracked">… {additionalTrackedCount} more</a></li>
      {/if}
    </ol>
  {/if}
</section>
