<script lang="ts">
  import GhosttyTerminal from "./components/GhosttyTerminal.svelte";
  import ResultsView from "./components/ResultsView.svelte";
  import TagInput from "./components/TagInput.svelte";
  import UserPublishView from "./components/UserPublishView.svelte";
  import { parseMembers } from "./lib/members";
  import { FailureLog } from "./lib/npmClient";
  import { runUserPublishes } from "./lib/reports";
  import { runAudit, type AuditResult } from "./lib/runAudit";
  import type { AuditConfig, ReportKind, UserPublishReport } from "./lib/types";

  type TerminalHandle = {
    writeLine: (line: string) => void;
    clear: () => void;
  };

  const REPORT_META: { kind: ReportKind; title: string; desc: string }[] = [
    {
      kind: "recent",
      title: "recent",
      desc: "Trust status (provenance / trusted publishing) of each package’s latest release.",
    },
    {
      kind: "manual",
      title: "manual",
      desc: "Who published manually (a non-bot account) within the window, and what.",
    },
    {
      kind: "external",
      title: "external",
      desc: "Users who can publish now but aren’t org members. Needs pasted membership.",
    },
  ];

  let terminal: TerminalHandle | null = $state(null);
  const log = (message: string) => terminal?.writeLine(message);

  let orgs: string[] = $state([]);
  let months = $state(12);
  let all = $state(false);
  let bots: string[] = $state([]);
  let jobs = $state(12);
  let selected: Record<ReportKind, boolean> = $state({
    recent: true,
    manual: false,
    external: false,
  });
  let membersRaw = $state("");

  let running = $state(false);
  let result = $state<AuditResult | null>(null);
  let error = $state<string | null>(null);
  let firstTab: ReportKind = $state("recent");
  let toast: string | null = $state(null);

  let sharing = $state(false);
  let shareUrl = $state<string | null>(null);

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
  const membersPlaceholder =
    "Paste output of `npm org ls <org> --json` here.\nMultiple orgs can be pasted one after another.";

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
        "The external report needs org members. Run the npm org ls commands below and paste the output.";
      return;
    }

    const config: AuditConfig = { orgs, months, all, bots, jobs };
    running = true;
    result = null;
    shareUrl = null;
    terminal?.clear();
    log(`→ audit ${orgs.join(", ")} | reports: ${selectedKinds.join(",")}`);
    log(all ? "→ scope: ALL org packages (-A)" : `→ scope: last ${months} months`);

    try {
      const response = await runAudit(config, selectedKinds, members, log);
      result = response;
      const first = selectedKinds.find(
        (kind) =>
          (kind === "recent" && response.recent) ||
          (kind === "manual" && response.manual) ||
          (kind === "external" && response.external),
      );
      if (first) firstTab = first;
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : String(reason);
      log(`Error: ${message}`);
      error = reason instanceof Error ? reason.message : "Audit failed.";
    } finally {
      running = false;
    }
  }

  async function handleShare() {
    if (!result) return;
    sharing = true;
    try {
      const scopeLabel =
        result.recent?.summary.scopeLabel ?? (all ? "all org packages" : `last ${months} months`);
      const response = await fetch("/api/reports", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ orgs, scopeLabel, payload: result }),
      });
      if (!response.ok) throw new Error(`Share failed (${response.status})`);
      const { id } = (await response.json()) as { id: string };
      const link = `${window.location.origin}/report/${id}`;
      shareUrl = link;
      await navigator.clipboard.writeText(link).catch(() => {});
      showToast("Share link copied to clipboard");
    } catch (reason) {
      showToast(reason instanceof Error ? reason.message : "Share failed");
    } finally {
      sharing = false;
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
      const report = await runUserPublishes(user, upMonths, jobs, extra, failures, log);
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
</script>

<div class="app">
  <header class="masthead">
    <p class="eyebrow">supply-chain audit</p>
    <h1><span class="pkg">npm</span> org trust &amp; access audit</h1>
    <p>
      Point this at any npm organizations to track trusted-publishing / provenance rollout, find
      packages published manually rather than via CI, and surface maintainers who can publish but
      aren&rsquo;t org members. Audit execution runs in your browser against public npm data; a
      read-only snapshot is stored only when you click Share report.
    </p>
  </header>

  <div class="layout">
    <section class="panel">
      <div class="panel__head">
        <h2>Configuration</h2>
        <span class="hint">generic — supply your own orgs</span>
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

        <div class="row">
          <div class="field">
            <label for="months">Window (months)</label>
            <input
              id="months"
              type="number"
              min="1"
              max="120"
              value={months}
              disabled={all}
              oninput={(event) => (months = Number(event.currentTarget.value) || 1)}
            />
          </div>
          <div class="field">
            <label for="jobs">Fetch concurrency</label>
            <input
              id="jobs"
              type="number"
              min="1"
              max="32"
              value={jobs}
              oninput={(event) => (jobs = Number(event.currentTarget.value) || 1)}
            />
          </div>
        </div>

        <div class="field">
          <label class="toggle">
            <input
              type="checkbox"
              checked={all}
              onchange={(event) => (all = event.currentTarget.checked)}
            />
            Analyze ALL org packages (ignore the recency window)
          </label>
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
            placeholder="e.g. GitHub Actions, ci-bot — Enter to add"
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
              npm membership isn&rsquo;t public. Run these locally (you must be authenticated), then
              paste the JSON output below:
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
              case-insensitive. Refresh this whenever membership changes.
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
        <strong>Live log</strong> rendered by
        <a href="https://github.com/coder/ghostty-web" target="_blank" rel="noreferrer">
          coder/ghostty-web
        </a>
        — Ghostty&rsquo;s VT100 parser compiled to WebAssembly. Progress mirrors the original shell scripts&rsquo;
        stderr. Failed fetches are retried with backoff and counted, so a rate-limited package never silently
        looks &ldquo;clean.&rdquo;
      </p>
    </section>
  </div>

  {#if hasReports && result}
    <section class="results" id="reports">
      <div class="results__head">
        <h2>Audit results</h2>
        <span class="hint">switch between reports with the tabs below</span>
      </div>
      <div class="share-bar">
        <div>
          <strong class="share-bar__title">Share this report</strong>
          <span class="share-bar__hint">
            Saves a read-only snapshot and gives you a link anyone can open.
          </span>
        </div>
        <button class="btn btn--ghost" type="button" onclick={handleShare} disabled={sharing}>
          {sharing ? "Saving…" : shareUrl ? "Re-share" : "Share report"}
        </button>
      </div>
      {#if shareUrl}
        <div class="share-link">
          <a href={shareUrl}>{shareUrl}</a>
          <button class="btn btn--sm btn--ghost" type="button" onclick={copyShareLink}>Copy</button>
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
        Versions a specific npm user personally published (recorded as the version&rsquo;s
        <code>_npmUser</code>) within the window. The package universe is the user&rsquo;s own
        maintained packages, optionally unioned with the packages from the last audit run.
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
    Trust logic ported verbatim from
    <a href="https://github.com/43081j/packumeta" target="_blank" rel="noreferrer">packumeta</a>:
    staged publish &gt; trusted publisher (OIDC + provenance) &gt; provenance &gt; none. Discovery
    via fast-npm-meta (npm.antfu.dev); trust from per-version registry manifests; weekly downloads
    from api.npmjs.org. &ldquo;Recency&rdquo; is the latest dist-tag&rsquo;s publish time, not the
    newest version overall.
  </footer>

  {#if toast}
    <div class="toast">{toast}</div>
  {/if}
</div>
