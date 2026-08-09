<script lang="ts">
  import { ArrowDown, CircleCheck } from "@lucide/svelte";
  import LogTerminal from "./components/LogTerminal.svelte";
  import HistoryPanel from "./components/HistoryPanel.svelte";
  import RecentReports from "./components/RecentReports.svelte";
  import SamplePreview from "./components/SamplePreview.svelte";
  import DailyTrackingButton from "./components/DailyTrackingButton.svelte";
  import ResultsView from "./components/ResultsView.svelte";
  import TagInput from "./components/TagInput.svelte";
  import ThemeToggle from "./components/ThemeToggle.svelte";
  import TrustGlossary from "./components/TrustGlossary.svelte";
  import Logo from "./components/Logo.svelte";
  import UserPublishView from "./components/UserPublishView.svelte";
  import {
    DEFAULT_BOT_EXCLUSIONS,
    MAX_ORGS,
    blockedOrgMessage,
    isBlockedOrg,
  } from "./lib/auditDefaults";
  import { streamAudit } from "./lib/auditStream";
  import { parseMembers } from "./lib/members";
  import type { AuditResult } from "./lib/runAudit";
  import type { ReportKind, UserPublishReport } from "./lib/types";
  import { streamUserPublishes } from "./lib/userPublishStream";

  type TerminalHandle = {
    writeLine: (line: string) => void;
    clear: () => void;
  };

  const REPORT_META: { kind: ReportKind; title: string; desc: string }[] = [
    {
      kind: "trust",
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

  // A shared report's "Re-run this audit" button links here with the run config
  // in the query string; pre-fill the form from it (and, when the run won't be
  // blocked on a missing member list, run immediately).
  interface Prefill {
    orgs: string[];
    all: boolean;
    months: number;
    bots: string[];
    selected: Record<ReportKind, boolean>;
    run: boolean;
  }
  function readPrefillFromUrl(): Prefill | null {
    if (typeof window === "undefined") return null;
    const params = new URLSearchParams(window.location.search);
    const orgsParam = params.get("orgs");
    if (!orgsParam) return null;
    const orgs = orgsParam
      .split(",")
      .map((slug) => slug.trim())
      .filter(Boolean)
      .slice(0, MAX_ORGS);
    if (orgs.length === 0) return null;

    const scope = params.get("scope");
    const all = scope === null || scope === "all";
    const monthsRaw = Number(scope);
    const months = !all && Number.isFinite(monthsRaw) && monthsRaw > 0 ? Math.floor(monthsRaw) : 12;

    const kinds = new Set((params.get("kinds") ?? "trust").split(",").map((kind) => kind.trim()));
    const selected: Record<ReportKind, boolean> = {
      trust: kinds.has("trust"),
      manual: kinds.has("manual"),
      external: kinds.has("external"),
    };
    if (!selected.trust && !selected.manual && !selected.external) selected.trust = true;

    const botsParam = params.get("bots");
    const bots = botsParam
      ? botsParam
          .split(",")
          .map((bot) => bot.trim())
          .filter(Boolean)
      : [...DEFAULT_BOT_EXCLUSIONS];

    return { orgs, all, months, bots, selected, run: params.get("run") === "1" };
  }
  const prefill = readPrefillFromUrl();

  let terminal: TerminalHandle | null = $state(null);
  let resultsHeading: HTMLHeadingElement | null = $state(null);
  const log = (message: string) => terminal?.writeLine(message);

  let orgs: string[] = $state(prefill?.orgs ?? []);
  let months = $state(prefill?.months ?? 12);
  let all = $state(prefill?.all ?? true);
  let bots: string[] = $state(prefill?.bots ?? [...DEFAULT_BOT_EXCLUSIONS]);
  let selected: Record<ReportKind, boolean> = $state(
    prefill?.selected ?? {
      trust: true,
      manual: true,
      external: false,
    },
  );
  let membersRaw = $state("");

  let running = $state(false);
  let result = $state<AuditResult | null>(null);
  let error = $state<string | null>(null);
  let firstTab: ReportKind = $state("trust");
  let toast: string | null = $state(null);

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
  // One audit or user lookup at a time — they share the live log.
  let busy = $derived(running || upRunning);
  let terminalActivity = $derived(
    running ? "audit running" : upRunning ? "user publish scan running" : null,
  );
  // Mirrors the server guards (AuditRequestSchema cap + blocked-org check) so the
  // problem is shown before submit, not just rejected after.
  let orgIssue = $derived.by(() => {
    const blocked = orgs.find(isBlockedOrg);
    if (blocked) return blockedOrgMessage(blocked);
    if (orgs.length > MAX_ORGS)
      return `Limit an audit to ${MAX_ORGS} orgs (you have ${orgs.length}).`;
    return null;
  });
  function containsReports(value: AuditResult | null): boolean {
    return !!(value?.trust || value?.manual || value?.external);
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
    if (value.trust) parts.push(plural(value.trust.rows.length, "package trust row"));
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

  // One-shot: if we arrived from a shared report's "Re-run" link, strip the query
  // from the URL (so a refresh doesn't silently re-run) and run — unless the run
  // needs an org member list (external), which the viewer has to paste first.
  let prefillHandled = false;
  $effect(() => {
    if (prefillHandled || !prefill) return;
    prefillHandled = true;
    history.replaceState(null, "", window.location.pathname);
    if (prefill.run && !prefill.selected.external) handleRun();
  });

  async function handleRun() {
    error = null;
    if (orgs.length === 0) {
      error = "Add at least one npm organization.";
      return;
    }
    if (orgIssue) {
      error = orgIssue;
      return;
    }
    if (selectedKinds.length === 0) {
      error = "Select at least one report.";
      return;
    }
    if (selected.external && members.length === 0) {
      error =
        "The external report needs your npm org member list. npm does not expose org membership publicly.";
      return;
    }

    const attempt = ++saveAttempt;
    running = true;
    result = null;
    shareUrl = null;
    savedReportId = null;
    savedReportCanTrackDaily = false;
    reportSaveError = null;
    terminal?.clear();
    log(`→ audit ${orgs.join(", ")} | reports: ${selectedKinds.join(",")}`);
    log(all ? "→ scope: ALL org packages (-A)" : `→ scope: last ${months} months`);

    try {
      // The audit runs server-side; we stream its progress into the terminal and
      // render the authoritative result it returns.
      const outcome = await streamAudit(
        { orgs, kinds: selectedKinds, months, all, bots, members },
        log,
      );
      if (attempt !== saveAttempt) return;
      result = outcome.result;
      if (outcome.result) {
        const ready = outcome.result;
        const first = selectedKinds.find(
          (kind) =>
            (kind === "trust" && ready.trust) ||
            (kind === "manual" && ready.manual) ||
            (kind === "external" && ready.external),
        );
        if (first) firstTab = first;
      }
      if (outcome.reportId) {
        savedReportId = outcome.reportId;
        shareUrl = `${window.location.origin}${outcome.reportUrl ?? `/report/${outcome.reportId}`}`;
        savedReportCanTrackDaily = all && !!outcome.result?.trust;
        historyRefreshKey++;
      } else if (outcome.saveError) {
        reportSaveError = outcome.saveError;
      }
    } catch (reason) {
      if (attempt !== saveAttempt) return;
      const message = reason instanceof Error ? reason.message : "Audit failed.";
      log(`Error: ${message}`);
      error = message;
    } finally {
      if (attempt === saveAttempt) running = false;
    }
  }

  async function handleRunUserPublishes() {
    upError = null;
    const user = upUser.trim();
    if (!user) {
      upError = "Enter an npm username.";
      return;
    }

    const extra = upUseCache && result?.trust ? result.trust.rows.map((row) => row.pkg) : [];
    upRunning = true;
    upResult = null;
    terminal?.clear();
    log(`→ user-publishes: ${user} (last ${upMonths} months)`);

    try {
      upResult = await streamUserPublishes(
        { user, months: upMonths, useCachePackages: extra },
        log,
      );
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
      <h1 class="wordmark">
        <a href="/#" aria-label="npm.report"><span>npm</span><Logo /><span>report</span></a>
      </h1>
      <div class="masthead__controls">
        <ThemeToggle />
        <TrustGlossary />
      </div>
    </div>
    <p class="tagline">
      Supply-chain trust signals for npm orgs. Audit, visualize, share, auto-track over time.
    </p>
  </header>

  {#if !result}
    <SamplePreview />
  {/if}

  <RecentReports />

  <div class="layout">
    <section class="panel" id="config">
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
            placeholder="e.g. nuxt, vue"
          />
          <p class="desc">
            One or more npm org slugs (up to {MAX_ORGS}). The registry caps org listings at 250
            packages (private/unlisted are not reachable unauthenticated).
          </p>
          {#if orgIssue}
            <p class="inline-error">{orgIssue}</p>
          {/if}
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
            placeholder="e.g. ci-bot"
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
          <button class="btn btn--primary" type="button" onclick={handleRun} disabled={busy}>
            {running ? "Running…" : "Run audit"}
          </button>
          {#if running}
            <span class="status">streaming to terminal →</span>
          {:else if upRunning}
            <span class="status">paused — user lookup running</span>
          {/if}
        </div>
        {#if error}
          <p class="inline-error">{error}</p>
        {/if}
      </div>
    </section>

    <section>
      <LogTerminal bind:this={terminal} activity={terminalActivity} />
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
      </div>
      <div class="share-bar">
        <div>
          <strong class="share-bar__title">Report link</strong>
          {#if shareUrl}
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

  <p class="methodology-note">
    &ldquo;Recency&rdquo; is the latest dist-tag&rsquo;s publish time. &ldquo;Manual&rdquo; means
    the publisher isn&rsquo;t in your bot-exclusion list &mdash; npm can&rsquo;t tell a human
    session from that account&rsquo;s automation token.
  </p>

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
            disabled={!result?.trust}
            onchange={(event) => (upUseCache = event.currentTarget.checked)}
          />
          Also scan packages from the last audit run
          {#if !result?.trust}
            (run an audit first)
          {/if}
        </label>
      </div>
      <div class="run-bar">
        <button
          class="btn btn--primary"
          type="button"
          onclick={handleRunUserPublishes}
          disabled={busy}
        >
          {upRunning ? "Scanning…" : "Look up"}
        </button>
        {#if upRunning}
          <span class="status">streaming to terminal →</span>
        {:else if running}
          <span class="status">paused — audit running</span>
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
    <p class="footer__brand">
      <span class="footer__mark">npm<span class="dot">.</span>report</span> · No affiliation or
      endorsement by npm, Inc. · Made by
      <a href="https://philippeserhal.com/" target="_blank" rel="noopener noreferrer"
        >Philippe Serhal</a
      >.
    </p>
  </footer>

  {#if toast}
    <div class="toast">{toast}</div>
  {/if}
</div>
