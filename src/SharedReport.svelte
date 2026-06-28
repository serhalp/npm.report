<script lang="ts">
  import HistoryPanel from "./components/HistoryPanel.svelte";
  import ResultsView from "./components/ResultsView.svelte";
  import ThemeToggle from "./components/ThemeToggle.svelte";
  import type { AuditResult } from "./lib/runAudit";

  interface ReportRecord {
    id: string;
    orgs: string;
    scopeLabel: string;
    payload: AuditResult;
    createdAt: string | null;
  }

  interface Props {
    id: string;
  }

  let { id }: Props = $props();

  let record = $state<ReportRecord | null>(null);
  let error = $state<string | null>(null);
  let toast = $state<string | null>(null);

  function generatedDay(value: ReportRecord | null): string | null {
    return value?.createdAt ? new Date(value.createdAt).toISOString().slice(0, 10) : null;
  }

  let when = $derived(generatedDay(record));
  let historyOrgs = $derived(record?.payload.recent?.summary.orgs ?? []);
  let historyEnabled = $derived(record?.payload.recent?.summary.scopeLabel === "ALL org packages");

  function showToast(message: string) {
    toast = message;
  }

  $effect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => {
      toast = null;
    }, 2200);
    return () => window.clearTimeout(timer);
  });

  $effect(() => {
    let cancelled = false;
    record = null;
    error = null;

    fetch(`/api/reports/${encodeURIComponent(id)}`)
      .then(async (response) => {
        if (response.status === 404) throw new Error("This report could not be found.");
        if (!response.ok) throw new Error(`Failed to load report (${response.status}).`);
        return (await response.json()) as ReportRecord;
      })
      .then((next) => {
        if (!cancelled) record = next;
      })
      .catch((reason: unknown) => {
        if (!cancelled) error = reason instanceof Error ? reason.message : "Failed to load report.";
      });

    return () => {
      cancelled = true;
    };
  });
</script>

<div class="app">
  <header class="masthead">
    <div class="masthead__top">
      <p class="eyebrow">supply-chain audit · shared report</p>
      <ThemeToggle />
    </div>
    <h1><span class="pkg">npm</span> org trust &amp; access audit</h1>
    {#if record}
      <p>
        Audit of <strong>{record.orgs || "npm packages"}</strong>
        {record.scopeLabel ? ` — ${record.scopeLabel}` : ""}
        {when ? `, generated ${when}` : ""}. This is a read-only snapshot.
        <a href="/">Run your own audit →</a>
      </p>
    {/if}
  </header>

  {#if error}
    <section class="panel">
      <div class="panel__body">
        <p class="inline-error shared-error">{error}</p>
        <p class="desc"><a href="/">Back to the audit tool →</a></p>
      </div>
    </section>
  {/if}

  {#if !record && !error}
    <section class="panel">
      <div class="panel__body">
        <p class="desc shared-loading">Loading report…</p>
      </div>
    </section>
  {/if}

  {#if record}
    <HistoryPanel orgs={historyOrgs} enabled={historyEnabled} currentReportId={record.id} />
    <section class="results">
      <ResultsView result={record.payload} onToast={showToast} />
    </section>
  {/if}

  {#if toast}
    <div class="toast">{toast}</div>
  {/if}
</div>
