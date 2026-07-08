<script lang="ts">
  import { ArrowDown, CircleCheck } from "@lucide/svelte";
  import GhosttyTerminal from "./components/GhosttyTerminal.svelte";
  import HistoryPanel from "./components/HistoryPanel.svelte";
  import RecentReports from "./components/RecentReports.svelte";
  import DailyTrackingButton from "./components/DailyTrackingButton.svelte";
  import ResultsView from "./components/ResultsView.svelte";
  import TagInput from "./components/TagInput.svelte";
  import ThemeToggle from "./components/ThemeToggle.svelte";
  import UserPublishView from "./components/UserPublishView.svelte";
  import { DEFAULT_BOT_EXCLUSIONS, FETCH_CONCURRENCY } from "./lib/auditDefaults";
  import { parseMembers } from "./lib/members";
  import { FailureLog } from "./lib/npmClient";
  import type { SharedReportScope } from "./lib/reportHistory";
  import { scopeLabelFor } from "./lib/reportHistory";
  import { runUserPublishes } from "./lib/reports";
  import { runAudit, type AuditResult } from "./lib/runAudit";
  import type { AuditConfig, ReportKind, UserPublishReport } from "./lib/types";

  type TerminalHandle = {
    writeLine: (line: string) => void;
    clear: () => void;
  };

  interface CompletedRunContext {
    orgs: string[];
    scope: SharedReportScope;
    scopeLabel: string;
    capturedAt: string;
  }

  const REPORT_META: { kind: ReportKind; title: string; desc: string }[] = [
    {
      kind: "recent",
      title: "package trust level",
      desc: "Trust status (provenance / trusted publishing) of each package's latest release.",
    },
    {
      kind: "manual",
      title: "manual",
      desc: "Who published manually (a non-bot account) within the window, and what.",
    },
    {
      kind: "external",
      title: "external",
      desc: "Public package maintainers compared with your private npm org member list.",
    },
  ];

  let terminal: TerminalHandle | null = $state(null);
  let resultsHeading: HTMLHeadingElement | null = $state(null);
  const log = (message: string) => terminal?.writeLine(message);

  let orgs: string[] = $state([]);
  let months = $state(12);
  let all = $state(true);
  let bots: string[] = $state([...DEFAULT_BOT_EXCLUSIONS]);
  let selected: Record<ReportKind, boolean> = $state({
    recent: true,
    manual: true,
    external: false,
  });
  let membersRaw = $state("");

  let running = $state(false);
  let result = $state<AuditResult | null>(null);
  let error = $state<string | null>(null);
  let firstTab: ReportKind = $state("recent");
  let toast: string | null = $state(null);

  let savingReport = $state(false);
  let reportSaveError = $state<string | null>(null);
  let shareUrl = $state<string | null>(null);
  let savedReportId = $state<string | null>(null);
  let savedReportCanTrackDaily = $state(false);
  let historyRefreshKey = $state(0);
  let saveAttempt = 0;

  let upUser = $state("");
  let upMonths = $state(12);
  let upUseCache = $state(true);
  let upRunning = $state(false);
  let upResult = $state<UserPublishReport | null>(null);
  let upError = $state<string | null>(null);

  let members = $derived(parseMembers(membersRaw));
  let selectedKinds = $derived(
    (Object.keys(selected) as ReportKind[]).filter((kind) => selected[kind]),
  );
  function containsReports(value: AuditResult | null): boolean {
    return !!(value?.recent || value?.manual || value?.external);
  }

  let hasReports = $derived(containsReports(result));
  let reportReadySummary = $derived(result ? summarizeReadyReport(result) : "");
  const membersPlaceholder =
    "Paste output of `npm org ls <org> --json` here.\nMultiple orgs can be pasted one after another.";

  function plural(count: number, singular: string, pluralLabel = `${singular}s`): string {
    return `${count} ${count === 1 ? singular : pluralLabel}`;
  }

  function summarizeReadyReport(value: AuditResult): string {
    const parts: string[] = [];
    if (value.recent) parts.push(plural(value.recent.rows.length, "package trust row"));
    if (value.manual)
      parts.push(plural(value.manual.rows.length, "manual publish", "manual publishes"));
    if (value.external) parts.push(plural(value.external.distinctUsers, "external account"));
    if (value.failures.length) parts.push(plural(value.failures.length, "fetch warning"));
    return parts.join(" · ");
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

  async function saveReportSnapshot(
    nextResult: AuditResult,
    context: CompletedRunContext,
    attempt: number,
  ) {
    savingReport = true;
    reportSaveError = null;
    try {
      const response = await fetch("/api/reports", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          orgs: context.orgs,
          scope: context.scope,
          scopeLabel: context.scopeLabel,
          capturedAt: context.capturedAt,
          payload: nextResult,
        }),
      });
      if (!response.ok) throw new Error(`Save failed (${response.status})`);
      const { id } = (await response.json()) as { id: string };
      if (attempt !== saveAttempt) return;
      savedReportId = id;
      savedReportCanTrackDaily = context.scope === "all" && !!nextResult.recent;
      shareUrl = `${window.location.origin}/report/${id}`;
      historyRefreshKey++;
    } catch (reason) {
      if (attempt !== saveAttempt) return;
      reportSaveError = reason instanceof Error ? reason.message : "Save failed";
    } finally {
      if (attempt === saveAttempt) savingReport = false;
    }
  }

  async function handleRun() {
    error = null;
    if (orgs.length === 0) {
      error = "Add at least one npm organization.";
      return;
    }
    if (selectedKinds.length === 0) {
      error = "Select at least one report.";
      return;
    }
    if (selected.external && members.length === 0 && selectedKinds.length === 1) {
      error =
        "The external report needs your npm org member list. npm does not expose org membership publicly.";
      return;
    }

    const config: AuditConfig = { orgs, months, all, bots, jobs: FETCH_CONCURRENCY };
    const attempt = ++saveAttempt;
    running = true;
    result = null;
    shareUrl = null;
    savedReportId = null;
    savedReportCanTrackDaily = false;
    savingReport = false;
    reportSaveError = null;
    terminal?.clear();
    log(`→ audit ${orgs.join(", ")} | reports: ${selectedKinds.join(",")}`);
    log(all ? "→ scope: ALL org packages (-A)" : `→ scope: last ${months} months`);

    try {
      const response = await runAudit(config, selectedKinds, members, log);
      result = response;
      const scope: SharedReportScope = config.all ? "all" : { months: config.months };
      const context: CompletedRunContext = {
        orgs: [...config.orgs],
        scope,
        scopeLabel: scopeLabelFor(scope),
        capturedAt: new Date().toISOString(),
      };
      const first = selectedKinds.find(
        (kind) =>
          (kind === "recent" && response.recent) ||
          (kind === "manual" && response.manual) ||
          (kind === "external" && response.external),
      );
      if (first) firstTab = first;
      void saveReportSnapshot(response, context, attempt);
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : String(reason);
      log(`Error: ${message}`);
      error = reason instanceof Error ? reason.message : "Audit failed.";
    } finally {
      running = false;
    }
  }

  async function handleRunUserPublishes() {
    upError = null;
    const user = upUser.trim();
    if (!user) {
      upError = "Enter an npm username.";
      return;
    }

    const extra = upUseCache && result?.recent ? result.recent.rows.map((row) => row.pkg) : [];
    upRunning = true;
    upResult = null;
    terminal?.clear();
    log(`→ user-publishes: ${user} (last ${upMonths} months)`);

    try {
      const failures = new FailureLog();
      const report = await runUserPublishes(
        user,
        upMonths,
        FETCH_CONCURRENCY,
        extra,
        failures,
        log,
      );
      if (failures.count > 0) {
        log(
          `WARNING: ${failures.count} fetch(es) failed after retries — results may be INCOMPLETE.`,
        );
      }
      upResult = report;
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : String(reason);
      log(`Error: ${message}`);
      upError = reason instanceof Error ? reason.message : "Lookup failed.";
    } finally {
      upRunning = false;
    }
  }

  function copyCommand(org: string) {
    navigator.clipboard
      .writeText(`npm org ls ${org} --json`)
      .then(() => showToast("Command copied"))
      .catch(() => showToast("Clipboard unavailable"));
  }

  function copyShareLink() {
    if (!shareUrl) return;
    navigator.clipboard
      .writeText(shareUrl)
      .then(() => showToast("Link copied"))
      .catch(() => showToast("Clipboard unavailable"));
  }

  function viewReport() {
    const target = resultsHeading ?? document.getElementById("reports");
    if (!target) return;
    const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    target.scrollIntoView({
      behavior: reduceMotion ? "auto" : "smooth",
      block: "start",
    });
    resultsHeading?.focus({ preventScroll: true });
  }
</script>

<div class="app">
  <header class="masthead">
    <div class="masthead__top">
      <p class="eyebrow">supply-chain audit</p>
      <ThemeToggle />
    </div>
    <h1><span class="pkg">npm</span> org trust &amp; access audit</h1>
    <p>
      Point this at any npm organizations to track trusted-publishing / provenance rollout, find
      packages published manually rather than via CI, and surface maintainers who can publish but
      aren&rsquo;t org members. Audit execution runs in your browser against public npm data; a
      read-only snapshot is saved automatically after each completed audit.
    </p>
  </header>

  <RecentReports />

  <div class="layout">
    <section class="panel">
      <div class="panel__head">
        <h2>Configuration</h2>
      </div>
      <div class="panel__body">
        <div class="field">
          <label for="orgs">Organizations</label>
          <TagInput
            id="orgs"
            values={orgs}
            onChange={(next) => (orgs = next)}
            placeholder="e.g. netlify, gatsbyjs — Enter to add"
          />
          <p class="desc">
            One or more npm org slugs. The registry caps org listings at 250 packages
            (private/unlisted are not reachable unauthenticated).
          </p>
        </div>

        <div class="field scope-field">
          <label class="toggle">
            <input
              type="checkbox"
              checked={!all}
              onchange={(event) => (all = !event.currentTarget.checked)}
            />
            Limit to recent packages
          </label>
          {#if !all}
            <div class="scope-window">
              <label for="months">Window (months)</label>
              <input
                id="months"
                type="number"
                min="1"
                max="120"
                value={months}
                oninput={(event) => (months = Number(event.currentTarget.value) || 1)}
              />
            </div>
          {/if}
        </div>

        <div class="field">
          <span class="field-label">Reports</span>
          <div class="checks">
            {#each REPORT_META as report (report.kind)}
              <label class={`check${selected[report.kind] ? " active" : ""}`}>
                <input
                  type="checkbox"
                  checked={selected[report.kind]}
                  onchange={(event) => (selected[report.kind] = event.currentTarget.checked)}
                />
                <span>
                  <span class="ctitle">{report.title}</span>
                  <span class="cdesc">{report.desc}</span>
                </span>
              </label>
            {/each}
          </div>
        </div>

        <div class="field">
          <label for="bots">Exclude bot / CI accounts (manual report)</label>
          <TagInput
            id="bots"
            values={bots}
            onChange={(next) => (bots = next)}
            placeholder="e.g. ci-bot — Enter to add"
          />
          <p class="desc">
            Publishers to treat as automation. Note: npm cannot distinguish a human from that
            human&rsquo;s CI token, so &ldquo;manual&rdquo; is a proxy, not proof.
          </p>
        </div>

        {#if selected.external}
          <div class="field">
            <label for="members">Org membership (for external report)</label>
            <p class="desc members-copy">
              npm exposes package maintainers publicly, but not org membership. Paste authenticated
              membership output so the app can compare the two lists:
            </p>
            {#each orgs.length ? orgs : ["<org>"] as org (org)}
              <div class="cmd-row">
                <code class="cmd">npm org ls {org} --json</code>
                <button
                  class="btn btn--sm btn--ghost"
                  type="button"
                  onclick={() => copyCommand(org)}
                >
                  Copy
                </button>
              </div>
            {/each}
            <textarea
              id="members"
              value={membersRaw}
              oninput={(event) => (membersRaw = event.currentTarget.value)}
              placeholder={membersPlaceholder}></textarea>
            <p class="desc">
              Parsed {members.length} member{members.length === 1 ? "" : "s"}. Matching is
              case-insensitive. The pasted member list is not stored; external findings are included
              in the saved report.
            </p>
          </div>
        {/if}

        <div class="run-bar">
          <button class="btn btn--primary" type="button" onclick={handleRun} disabled={running}>
            {running ? "Running…" : "Run audit"}
          </button>
          {#if running}
            <span class="status">streaming to terminal →</span>
          {/if}
        </div>
        {#if error}
          <p class="inline-error">{error}</p>
        {/if}
      </div>
    </section>

    <section>
      <GhosttyTerminal bind:this={terminal} />
      <p class="note">
        <strong>Live log</strong> shows audit progress and warnings. Network and rate-limit failures are
        counted so incomplete results stay visible.
      </p>
      {#if hasReports && result && !running}
        <div class="report-ready">
          <div class="report-ready__main">
            <CircleCheck aria-hidden="true" size={18} strokeWidth={2} />
            <div class="report-ready__text" role="status" aria-live="polite">
              <strong>Report ready</strong>
              <span>{reportReadySummary}</span>
            </div>
          </div>
          <button class="btn btn--sm btn--ready" type="button" onclick={viewReport}>
            <ArrowDown aria-hidden="true" size={15} strokeWidth={2} />
            View report
          </button>
        </div>
      {/if}
      <HistoryPanel {orgs} enabled={all && orgs.length > 0} refreshKey={historyRefreshKey} />
    </section>
  </div>

  {#if hasReports && result}
    <section class="results" id="reports">
      <div class="results__head">
        <h2 id="audit-results-title" bind:this={resultsHeading} tabindex="-1">Audit results</h2>
        <span class="hint">switch between reports with the tabs below</span>
      </div>
      <div class="share-bar">
        <div>
          <strong class="share-bar__title">Report link</strong>
          {#if savingReport}
            <span class="share-bar__hint">Saving read-only snapshot…</span>
          {:else if shareUrl}
            <span class="share-bar__hint">Saved automatically after this run.</span>
          {:else if reportSaveError}
            <span class="share-bar__hint">Report link unavailable: {reportSaveError}</span>
          {:else}
            <span class="share-bar__hint">Link appears after the report is saved.</span>
          {/if}
        </div>
        <div class="share-bar__actions">
          <DailyTrackingButton
            reportId={savedReportId}
            enabled={savedReportCanTrackDaily}
            onToast={showToast}
          />
          <button class="btn btn--ghost" type="button" onclick={copyShareLink} disabled={!shareUrl}>
            Copy link
          </button>
        </div>
      </div>
      {#if shareUrl}
        <div class="share-link">
          <a href={shareUrl}>{shareUrl}</a>
        </div>
      {/if}
      <ResultsView {result} onToast={showToast} initialTab={firstTab} />
    </section>
  {/if}

  <section class="panel user-publish-panel">
    <div class="panel__head">
      <h2>User publish history</h2>
      <span class="hint">standalone — by npm account</span>
    </div>
    <div class="panel__body">
      <p class="desc user-publish-copy">
        Versions attributed to a specific npm publisher within the window. This scans that
        account&rsquo;s maintained packages, optionally combined with packages from the last audit
        run.
      </p>
      <div class="row">
        <div class="field">
          <label for="up-user">npm username</label>
          <input
            id="up-user"
            type="text"
            value={upUser}
            oninput={(event) => (upUser = event.currentTarget.value)}
            placeholder="e.g. some-maintainer"
          />
        </div>
        <div class="field">
          <label for="up-months">User window (months)</label>
          <input
            id="up-months"
            type="number"
            min="1"
            max="120"
            value={upMonths}
            oninput={(event) => (upMonths = Number(event.currentTarget.value) || 1)}
          />
        </div>
      </div>
      <div class="field">
        <label class="toggle">
          <input
            type="checkbox"
            checked={upUseCache}
            disabled={!result?.recent}
            onchange={(event) => (upUseCache = event.currentTarget.checked)}
          />
          Also scan packages from the last audit run
          {#if !result?.recent}
            (run an audit first)
          {/if}
        </label>
      </div>
      <div class="run-bar">
        <button
          class="btn btn--primary"
          type="button"
          onclick={handleRunUserPublishes}
          disabled={upRunning}
        >
          {upRunning ? "Scanning…" : "Look up"}
        </button>
        {#if upRunning}
          <span class="status">streaming to terminal →</span>
        {/if}
      </div>
      {#if upError}
        <p class="inline-error">{upError}</p>
      {/if}
      {#if upResult}
        <div class="user-publish-result">
          <UserPublishView report={upResult} onToast={showToast} />
        </div>
      {/if}
    </div>
  </section>

  <footer class="footer">
    &ldquo;Recency&rdquo; uses the latest dist-tag&rsquo;s publish time. &ldquo;Manual&rdquo; means
    the publisher is not in your bot exclusion list; npm cannot tell a human session from that
    account&rsquo;s automation token.
  </footer>

  {#if toast}
    <div class="toast">{toast}</div>
  {/if}
</div>
