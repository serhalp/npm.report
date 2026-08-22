<script lang="ts">
  import { RefreshCw } from "@lucide/svelte";
  import HistoryPanel from "./components/HistoryPanel.svelte";
  import DailyTrackingButton from "./components/DailyTrackingButton.svelte";
  import ResultsView from "./components/ResultsView.svelte";
  import SiteFooter from "./components/SiteFooter.svelte";
  import ThemeToggle from "./components/ThemeToggle.svelte";
  import TrustGlossary from "./components/TrustGlossary.svelte";
  import Logo from "./components/Logo.svelte";
  import type { ReportHistoryResponse } from "./lib/reportHistory";
  import type { AuditResult } from "./lib/runAudit";
  import { parseOrNull, ReportHistoryResponseSchema, ReportRecordSchema } from "./lib/schemas";

  interface ReportRecord {
    id: string;
    orgs: string;
    scopeLabel: string;
    payload: AuditResult;
    createdAt: string | null;
    dailyTrackingEnabled: boolean;
    dailyTrackingNextRunAt: string | null;
  }

  interface Props {
    id: string;
  }

  let { id }: Props = $props();

  let record = $state<ReportRecord | null>(null);
  let reportHistory = $state<ReportHistoryResponse | null>(null);
  let error = $state<string | null>(null);
  let loading = $state(true);
  let toast = $state<string | null>(null);

  function generatedDay(value: ReportRecord | null): string | null {
    return value?.createdAt ? new Date(value.createdAt).toISOString().slice(0, 10) : null;
  }

  let when = $derived(generatedDay(record));
  let auditDetails = $derived(
    `${record?.scopeLabel && record.scopeLabel !== "ALL org packages" ? ` — ${record.scopeLabel}` : ""}${when ? `, generated ${when}` : ""}`,
  );
  let historyOrgs = $derived(record?.payload.trust?.summary.orgs ?? []);
  let historyEnabled = $derived(
    record?.scopeLabel === "ALL org packages" && !!record.payload.trust,
  );

  function historyConfig(value: ReportRecord): { enabled: boolean; orgs: string[] } {
    return {
      enabled: value.scopeLabel === "ALL org packages" && !!value.payload.trust,
      orgs: value.payload.trust?.summary.orgs ?? [],
    };
  }

  async function loadHistory(value: ReportRecord): Promise<ReportHistoryResponse | null> {
    const config = historyConfig(value);
    if (!config.enabled || config.orgs.length === 0) return null;

    const params = new URLSearchParams();
    for (const org of config.orgs) params.append("org", org);

    try {
      const response = await fetch(`/api/reports/history?${params}`);
      if (!response.ok) return { orgs: config.orgs, points: [] };
      const data: unknown = await response.json();
      return parseOrNull(ReportHistoryResponseSchema, data)
        ? (data as ReportHistoryResponse)
        : { orgs: config.orgs, points: [] };
    } catch {
      return { orgs: config.orgs, points: [] };
    }
  }

  const REPORT_KINDS = ["trust", "manual", "external"] as const;

  function monthsFromLabel(label: string): number {
    const match = label.match(/last (\d+) months/);
    return match ? Number(match[1]) : 12;
  }

  // Saved external reports omit the private member list, so reruns can only
  // prefill their public configuration.
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
    loading = true;
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
      .then(async (next) => ({ next, history: await loadHistory(next) }))
      .then(({ next, history }) => {
        if (!cancelled) {
          reportHistory = history;
          record = next;
          loading = false;
        }
      })
      .catch((reason: unknown) => {
        if (!cancelled) {
          record = null;
          reportHistory = null;
          error = reason instanceof Error ? reason.message : "Failed to load report.";
          loading = false;
        }
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
        Audit of <strong>{record.orgs || "npm packages"}</strong>{auditDetails}. This is a read-only
        snapshot.
        <br />
        <a href="/">Run your own audit →</a>
      </p>
    {/if}
  </header>

  <main tabindex="-1" aria-busy={loading}>
    {#if error}
      <section class="panel">
        <div class="panel__body">
          <p class="inline-error shared-error" role="alert">{error}</p>
          <p class="desc"><a href="/">Back to the audit tool →</a></p>
        </div>
      </section>
    {/if}

    {#if !record && !error}
      <section class="panel">
        <div class="panel__body">
          <p class="desc shared-loading" role="status">Loading report…</p>
        </div>
      </section>
    {/if}

    {#if record}
      <h2 class="sr-only">Audit of {record.orgs || "npm packages"}</h2>
      <div class="shared-actions">
        <a class="btn btn--primary" href={rerunHref(record)}>
          <RefreshCw aria-hidden="true" size={15} strokeWidth={2} />
          Re-run this audit
        </a>
        <DailyTrackingButton
          reportId={record.id}
          enabled={historyEnabled}
          alreadyTracked={record.dailyTrackingEnabled}
          nextRunAt={record.dailyTrackingNextRunAt}
          onToast={showToast}
        />
      </div>
      <HistoryPanel
        orgs={historyOrgs}
        enabled={historyEnabled}
        currentReportId={record.id}
        preloadedHistory={reportHistory ?? undefined}
      />
      <section class="results">
        <ResultsView result={record.payload} onToast={showToast} />
      </section>
    {/if}
  </main>

  <SiteFooter />

  <div
    class:toast={!!toast}
    class:sr-only={!toast}
    role="status"
    aria-live="polite"
    aria-atomic="true"
  >
    {toast ?? ""}
  </div>
</div>
