<script module lang="ts">
  import { parseOrNull, TrackedOrgSetsResponseSchema } from "#shared/schemas";

  let trackedOrgCountRequest:
    | { fetcher: typeof fetch; promise: Promise<number | null> }
    | undefined;

  function loadTrackedOrgCount(refresh = false): Promise<number | null> {
    const fetcher = fetch;
    if (refresh || trackedOrgCountRequest?.fetcher !== fetcher) {
      trackedOrgCountRequest = {
        fetcher,
        promise: fetcher("/api/reports/tracked")
          .then(async (response) => {
            if (!response.ok) return null;
            const body = parseOrNull(TrackedOrgSetsResponseSchema, await response.json());
            return body ? new Set(body.orgSets.flatMap((orgSet) => orgSet.orgs)).size : null;
          })
          .catch(() => null),
      };
    }
    return trackedOrgCountRequest.promise;
  }
</script>

<script lang="ts">
  import type { Snippet } from "svelte";
  import ThemeToggle from "./ThemeToggle.svelte";
  import TrustGlossary from "./TrustGlossary.svelte";
  import logo from "./logo.svg";

  interface Props {
    children?: Snippet;
    tracked?: boolean;
  }

  let { children, tracked = false }: Props = $props();
  let trackedOrgCount = $state<number | null | undefined>(undefined);
  let trackedOrgLabel = $derived(
    trackedOrgCount === undefined
      ? "Tracking … orgs"
      : trackedOrgCount === null
        ? "Tracking orgs"
        : `Tracking ${trackedOrgCount} ${trackedOrgCount === 1 ? "org" : "orgs"}`,
  );

  $effect(() => {
    let cancelled = false;

    function updateCount(refresh = false): void {
      loadTrackedOrgCount(refresh).then((count) => {
        if (!cancelled) trackedOrgCount = count;
      });
    }

    function handleTrackingChange(): void {
      updateCount(true);
    }

    updateCount();
    window.addEventListener("npm.report:tracked-orgs-changed", handleTrackingChange);

    return () => {
      cancelled = true;
      window.removeEventListener("npm.report:tracked-orgs-changed", handleTrackingChange);
    };
  });
</script>

<header class="masthead">
  <div class="masthead__top">
    <h1 class="wordmark">
      <a href="/#" aria-label="npm.report"
        ><span>npm</span><img class="logo" src={logo} alt="" /><span>report</span></a
      >
    </h1>
    <div class="masthead__actions">
      <nav class="masthead__nav" aria-label="Primary">
        <a
          class="masthead__nav-link"
          href="/tracked"
          aria-label={trackedOrgLabel}
          aria-current={tracked ? "page" : undefined}
          ><img class="masthead__nav-mark" src={logo} alt="" /><span>Tracking</span
          >{#if trackedOrgCount !== null}<span class="masthead__nav-count"
              >{trackedOrgCount ?? "…"}</span
            >{/if}<span>{trackedOrgCount === 1 ? "org" : "orgs"}</span></a
        >
      </nav>
      <div class="masthead__controls">
        <ThemeToggle />
        <TrustGlossary />
      </div>
    </div>
  </div>
  {#if children}
    {@render children()}
  {/if}
</header>
