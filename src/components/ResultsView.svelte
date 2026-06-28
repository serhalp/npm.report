<script lang="ts">
  import ExternalView from "./ExternalView.svelte";
  import ManualView from "./ManualView.svelte";
  import RecentView from "./RecentView.svelte";
  import type { AuditResult } from "../lib/runAudit";
  import type { ReportKind } from "../lib/types";

  const TAB_META: { kind: ReportKind; title: string }[] = [
    { kind: "recent", title: "package trust level" },
    { kind: "manual", title: "manual" },
    { kind: "external", title: "external" },
  ];

  interface Props {
    result: AuditResult;
    onToast: (message: string) => void;
    initialTab?: ReportKind;
  }

  let { result, onToast, initialTab }: Props = $props();

  let tabs = $derived(
    TAB_META.filter(
      (tab) =>
        (tab.kind === "recent" && result.recent) ||
        (tab.kind === "manual" && result.manual) ||
        (tab.kind === "external" && result.external),
    ),
  );

  let activeTab: ReportKind = $state("recent");
  let initialized = $state(false);

  function hashKind(): ReportKind | null {
    if (typeof window === "undefined") return null;
    const hash = window.location.hash.replace(/^#/, "");
    return TAB_META.some((tab) => tab.kind === hash) ? (hash as ReportKind) : null;
  }

  function validTab(kind: ReportKind | null): kind is ReportKind {
    return !!kind && tabs.some((tab) => tab.kind === kind);
  }

  $effect(() => {
    if (initialized || tabs.length === 0) return;

    const fromHash = hashKind();
    if (validTab(fromHash)) activeTab = fromHash;
    else if (validTab(initialTab ?? null)) activeTab = initialTab!;
    else activeTab = tabs[0].kind;
    initialized = true;
  });

  $effect(() => {
    const onHashChange = () => {
      const kind = hashKind();
      if (validTab(kind)) activeTab = kind;
    };

    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  });

  function selectTab(kind: ReportKind) {
    activeTab = kind;
    window.history.replaceState(null, "", `#${kind}`);
  }

  function countFor(kind: ReportKind): number | undefined {
    if (kind === "recent") return result.recent?.summary.total;
    if (kind === "manual") return result.manual?.rows.length;
    return result.external?.distinctUsers;
  }
</script>

{#if tabs.length > 0}
  <div class="tabs" role="tablist" aria-label="Audit reports">
    <span class="tabs__label">Reports</span>
    {#each tabs as tab (tab.kind)}
      <button
        id={tab.kind}
        role="tab"
        type="button"
        aria-selected={activeTab === tab.kind}
        class={`tab${activeTab === tab.kind ? " active" : ""}`}
        onclick={() => selectTab(tab.kind)}
      >
        {tab.title}
        <span class="count">{countFor(tab.kind)}</span>
      </button>
    {/each}
  </div>

  {#if activeTab === "recent" && result.recent}
    <RecentView report={result.recent} {onToast} />
  {/if}
  {#if activeTab === "manual" && result.manual}
    <ManualView report={result.manual} {onToast} />
  {/if}
  {#if activeTab === "external" && result.external}
    <ExternalView report={result.external} {onToast} />
  {/if}

  {#if result.failures.length > 0}
    <p class="inline-error incomplete-warning">
      {result.failures.length} fetch(es) failed after retries — results may be INCOMPLETE.
    </p>
  {/if}
{/if}
