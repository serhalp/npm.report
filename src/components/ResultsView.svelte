<script lang="ts">
  import ExternalView from "./ExternalView.svelte";
  import ManualView from "./ManualView.svelte";
  import TrustView from "./TrustView.svelte";
  import type { AuditResult } from "../lib/runAudit";
  import type { ReportKind } from "../lib/types";

  const TAB_META: { kind: ReportKind; title: string }[] = [
    { kind: "trust", title: "package trust level" },
    { kind: "manual", title: "manual" },
    { kind: "external", title: "external" },
  ];

  // Namespaced URL-hash key so it can't collide with an element id — the tab
  // buttons use `tab-<kind>` and the panels `panel-<kind>` (writing `#external`
  // straight to the hash used to match the tab button's own id).
  const HASH_PREFIX = "report=";

  interface Props {
    result: AuditResult;
    onToast: (message: string) => void;
    initialTab?: ReportKind;
  }

  let { result, onToast, initialTab }: Props = $props();

  let tabs = $derived(
    TAB_META.filter(
      (tab) =>
        (tab.kind === "trust" && result.trust) ||
        (tab.kind === "manual" && result.manual) ||
        (tab.kind === "external" && result.external),
    ),
  );

  let activeTab: ReportKind = $state("trust");
  let initialized = $state(false);

  function hashKind(): ReportKind | null {
    if (typeof window === "undefined") return null;
    const hash = window.location.hash.replace(/^#/, "");
    if (!hash.startsWith(HASH_PREFIX)) return null;
    const kind = hash.slice(HASH_PREFIX.length);
    return TAB_META.some((tab) => tab.kind === kind) ? (kind as ReportKind) : null;
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
    window.history.replaceState(null, "", `#${HASH_PREFIX}${kind}`);
  }

  // Roving-tabindex arrow-key nav per the WAI-ARIA tabs pattern: Left/Right move
  // focus + selection (wrapping), Home/End jump to the ends.
  function moveTab(event: KeyboardEvent, kind: ReportKind) {
    const i = tabs.findIndex((tab) => tab.kind === kind);
    if (i < 0) return;
    let next = -1;
    if (event.key === "ArrowRight") next = (i + 1) % tabs.length;
    else if (event.key === "ArrowLeft") next = (i - 1 + tabs.length) % tabs.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = tabs.length - 1;
    if (next < 0) return;
    event.preventDefault();
    const target = tabs[next].kind;
    selectTab(target);
    document.getElementById(`tab-${target}`)?.focus();
  }

  function countFor(kind: ReportKind): number | undefined {
    if (kind === "trust") return result.trust?.summary.total;
    if (kind === "manual") return result.manual?.rows.length;
    return result.external?.distinctUsers;
  }
</script>

{#if tabs.length > 0}
  <div class="tabs" role="tablist" aria-label="Audit reports">
    <span class="tabs__label">Reports</span>
    {#each tabs as tab (tab.kind)}
      <button
        id={`tab-${tab.kind}`}
        role="tab"
        type="button"
        aria-selected={activeTab === tab.kind}
        aria-controls={activeTab === tab.kind ? `panel-${tab.kind}` : undefined}
        tabindex={activeTab === tab.kind ? 0 : -1}
        class={`tab${activeTab === tab.kind ? " active" : ""}`}
        onclick={() => selectTab(tab.kind)}
        onkeydown={(event) => moveTab(event, tab.kind)}
      >
        {tab.title}
        <span class="count">{countFor(tab.kind)}</span>
      </button>
    {/each}
  </div>

  {#if activeTab === "trust" && result.trust}
    <div id="panel-trust" role="tabpanel" aria-labelledby="tab-trust" tabindex="0">
      <TrustView report={result.trust} {onToast} />
    </div>
  {/if}
  {#if activeTab === "manual" && result.manual}
    <div id="panel-manual" role="tabpanel" aria-labelledby="tab-manual" tabindex="0">
      <ManualView report={result.manual} {onToast} />
    </div>
  {/if}
  {#if activeTab === "external" && result.external}
    <div id="panel-external" role="tabpanel" aria-labelledby="tab-external" tabindex="0">
      <ExternalView report={result.external} {onToast} />
    </div>
  {/if}

  {#if result.failures.length > 0}
    <p class="inline-error incomplete-warning" role="alert">
      {result.failures.length} fetch(es) failed after retries — results may be INCOMPLETE.
    </p>
  {/if}
{/if}
