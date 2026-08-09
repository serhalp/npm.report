<script lang="ts">
  import { RefreshCw } from "@lucide/svelte";
  import HistoryPanel from "./components/HistoryPanel.svelte";
  import DailyTrackingButton from "./components/DailyTrackingButton.svelte";
  import ResultsView from "./components/ResultsView.svelte";
  import ThemeToggle from "./components/ThemeToggle.svelte";
  import TrustGlossary from "./components/TrustGlossary.svelte";
  import Logo from "./components/Logo.svelte";
  import type { AuditResult } from "./lib/runAudit";
  import { parseOrNull, ReportRecordSchema } from "./lib/schemas";

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
  let historyOrgs = $derived(record?.payload.trust?.summary.orgs ?? []);
  let historyEnabled = $derived(
    record?.scopeLabel === "ALL org packages" && !!record.payload.trust,
  );

  const REPORT_KINDS = ["trust", "manual", "external"] as const;

  function monthsFromLabel(label: string): number {
    const match = label.match(/last (\d+) months/);
    return match ? Number(match[1]) : 12;
  }

  // Build the auditor URL that re-runs this report's config. External needs a
  // member list (never stored), so App.svelte pre-fills but doesn't auto-run it.
  function rerunHref(rec: ReportRecord): string {
    const orgs = (rec.payload.trust?.summary.orgs ?? rec.orgs.split(/,\s*/)).filter(Boolean);
    const kinds = REPORT_KINDS.filter((kind) => rec.payload[kind]);
    const params = new URLSearchParams();
    params.set("orgs", orgs.join(","));
    params.set(
      "scope",
      rec.scopeLabel === "ALL org packages" ? "all" : String(monthsFromLabel(rec.scopeLabel)),
    );
    if (kinds.length) params.set("kinds", kinds.join(","));
    if (rec.payload.manual?.bots?.length) params.set("bots", rec.payload.manual.bots.join(","));
    params.set("run", "1");
    return `/?${params.toString()}`;
  }

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
        const data: unknown = await response.json();
        if (!parseOrNull(ReportRecordSchema, data)) {
          throw new Error("This report is in an unexpected format and can't be displayed.");
        }
        return data as ReportRecord;
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
      <h1 class="wordmark">
        <a href="/#" aria-label="npm.report"><span>npm</span><Logo /><span>report</span></a>
      </h1>
      <div class="masthead__controls">
        <ThemeToggle />
        <TrustGlossary />
      </div>
    </div>
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
    <div class="shared-actions">
      <button
        class="btn btn--primary"
        type="button"
        onclick={() => {
          if (record) window.location.href = rerunHref(record);
        }}
      >
        <RefreshCw aria-hidden="true" size={15} strokeWidth={2} />
        Re-run this audit
      </button>
      <DailyTrackingButton reportId={record.id} enabled={historyEnabled} onToast={showToast} />
    </div>
    <HistoryPanel orgs={historyOrgs} enabled={historyEnabled} currentReportId={record.id} />
    <section class="results">
      <ResultsView result={record.payload} onToast={showToast} />
    </section>
  {/if}

  {#if toast}
    <div class="toast">{toast}</div>
  {/if}
</div>
