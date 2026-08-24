<script lang="ts">
  import { formatCompactDateTime, formatDate, formatDateTime } from "#client/dateFormatting";
  import type { TrackedOrgSet, TrackedOrgSetsResponse } from "#shared/reportHistory";
  import { anyTrustCount, orgSetPath, strongTrustCount } from "#shared/reportHistory";
  import { parseOrNull, TrackedOrgSetsResponseSchema } from "#shared/schemas";
  import HistoryStack from "./components/HistoryStack.svelte";
  import SignalSpinner from "./components/SignalSpinner.svelte";
  import SiteFooter from "./components/SiteFooter.svelte";
  import SiteHeader from "./components/SiteHeader.svelte";

  let orgSets = $state<TrackedOrgSet[]>([]);
  let loading = $state(true);
  let error = $state<string | null>(null);

  function orgLabel(orgs: string[]): string {
    return orgs.length > 0 ? orgs.join(", ") : "npm packages";
  }

  $effect(() => {
    let cancelled = false;
    loading = true;
    error = null;

    fetch("/api/reports/tracked")
      .then(async (response) => {
        if (!response.ok) throw new Error(`Failed to load tracked orgs (${response.status}).`);
        const data: unknown = await response.json();
        if (!parseOrNull(TrackedOrgSetsResponseSchema, data)) {
          throw new Error("Tracked org data is in an unexpected format.");
        }
        return data as TrackedOrgSetsResponse;
      })
      .then((body) => {
        if (!cancelled) orgSets = body.orgSets;
      })
      .catch((reason: unknown) => {
        if (!cancelled) {
          orgSets = [];
          error = reason instanceof Error ? reason.message : "Failed to load tracked orgs.";
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

<svelte:head>
  <title>Tracked npm orgs · npm.report</title>
  <meta
    name="description"
    content="Latest package trust snapshots for npm organization sets tracked by npm.report."
  />
</svelte:head>

<div class="app">
  <SiteHeader tracked>
    <p class="tagline">Daily package trust across tracked npm org sets.</p>
  </SiteHeader>

  <main tabindex="-1" aria-busy={loading}>
    <section class="tracked-page" aria-labelledby="tracked-title">
      <div class="tracked-page__head">
        <div>
          <h2 id="tracked-title">Tracked org sets</h2>
          <p>Latest daily package-trust snapshot for every tracked set.</p>
        </div>
        {#if !loading && !error}
          <span class="tracked-page__count"
            >{orgSets.length} set{orgSets.length === 1 ? "" : "s"}</span
          >
        {/if}
      </div>

      {#if loading}
        <div class="tracked-loading" role="status">
          <SignalSpinner />
          <span>Loading tracked orgs…</span>
        </div>
      {:else if error}
        <p class="inline-error" role="alert">{error}</p>
      {:else if orgSets.length === 0}
        <p class="tracked-empty">No org sets are tracked yet.</p>
      {:else}
        <ol class="tracked-list">
          {#each orgSets as orgSet (orgSet.latest.id)}
            <li>
              <div class="tracked-list__identity">
                <a href={orgSetPath(orgSet.orgs)}>{orgLabel(orgSet.orgs)}</a>
                <span>
                  Latest
                  <time
                    datetime={orgSet.latest.capturedAt}
                    title={formatDateTime(orgSet.latest.capturedAt)}
                    >{formatDate(orgSet.latest.capturedAt)}</time
                  >
                </span>
              </div>
              <HistoryStack point={orgSet.latest} />
              <div class="tracked-list__summary">
                <span
                  ><strong>{strongTrustCount(orgSet.latest)}</strong>/{orgSet.latest.total} strong</span
                >
                <span
                  ><strong>{anyTrustCount(orgSet.latest)}</strong>/{orgSet.latest.total} any trust</span
                >
              </div>
              <div class="tracked-list__next">
                Next
                <time datetime={orgSet.nextRunAt} title={formatDateTime(orgSet.nextRunAt)}
                  >{formatCompactDateTime(orgSet.nextRunAt)}</time
                >
              </div>
              <a class="tracked-list__view" href={orgSetPath(orgSet.orgs)}>View latest →</a>
            </li>
          {/each}
        </ol>
      {/if}
    </section>
  </main>

  <SiteFooter />
</div>
