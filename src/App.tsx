import { useEffect, useMemo, useRef, useState } from "react";
import { GhosttyTerminal, type TerminalHandle } from "./components/GhosttyTerminal";
import { TagInput } from "./components/TagInput";
import { UserPublishView } from "./components/ReportViews";
import { ResultsView } from "./components/ResultsView";
import { parseMembers } from "./lib/members";
import { FailureLog } from "./lib/npmClient";
import { runUserPublishes } from "./lib/reports";
import { runAudit, type AuditResult } from "./lib/runAudit";
import type { AuditConfig, ReportKind, UserPublishReport } from "./lib/types";

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

export default function App() {
  const termRef = useRef<TerminalHandle>(null);
  const log = (msg: string) => termRef.current?.writeLine(msg);

  // --- audit config ---
  const [orgs, setOrgs] = useState<string[]>([]);
  const [months, setMonths] = useState(12);
  const [all, setAll] = useState(false);
  const [bots, setBots] = useState<string[]>([]);
  const [jobs, setJobs] = useState(12);
  const [selected, setSelected] = useState<Record<ReportKind, boolean>>({
    recent: true,
    manual: false,
    external: false,
  });
  const [membersRaw, setMembersRaw] = useState("");
  const members = useMemo(() => parseMembers(membersRaw), [membersRaw]);

  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<AuditResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [firstTab, setFirstTab] = useState<ReportKind>("recent");
  const [toast, setToast] = useState<string | null>(null);

  // --- sharing ---
  const [sharing, setSharing] = useState(false);
  const [shareUrl, setShareUrl] = useState<string | null>(null);

  // --- user-publishes tool ---
  const [upUser, setUpUser] = useState("");
  const [upMonths, setUpMonths] = useState(12);
  const [upUseCache, setUpUseCache] = useState(true);
  const [upRunning, setUpRunning] = useState(false);
  const [upResult, setUpResult] = useState<UserPublishReport | null>(null);
  const [upError, setUpError] = useState<string | null>(null);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2200);
    return () => clearTimeout(t);
  }, [toast]);

  const showToast = (m: string) => setToast(m);

  const selectedKinds = (Object.keys(selected) as ReportKind[]).filter((k) => selected[k]);

  async function handleRun() {
    setError(null);
    if (orgs.length === 0) {
      setError("Add at least one npm organization.");
      return;
    }
    if (selectedKinds.length === 0) {
      setError("Select at least one report.");
      return;
    }
    if (selected.external && members.length === 0 && selectedKinds.length === 1) {
      setError(
        "The external report needs org members. Run the npm org ls commands below and paste the output.",
      );
      return;
    }

    const config: AuditConfig = { orgs, months, all, bots, jobs };
    setRunning(true);
    setResult(null);
    setShareUrl(null);
    termRef.current?.clear();
    log(`→ audit ${orgs.join(", ")} | reports: ${selectedKinds.join(",")}`);
    log(all ? "→ scope: ALL org packages (-A)" : `→ scope: last ${months} months`);
    try {
      const res = await runAudit(config, selectedKinds, members, log);
      setResult(res);
      const first = selectedKinds.find(
        (k) =>
          (k === "recent" && res.recent) ||
          (k === "manual" && res.manual) ||
          (k === "external" && res.external),
      );
      if (first) setFirstTab(first);
    } catch (e) {
      log(`Error: ${e instanceof Error ? e.message : String(e)}`);
      setError(e instanceof Error ? e.message : "Audit failed.");
    } finally {
      setRunning(false);
    }
  }

  async function handleShare() {
    if (!result) return;
    setSharing(true);
    try {
      const scopeLabel =
        result.recent?.summary.scopeLabel ?? (all ? "all org packages" : `last ${months} months`);
      const res = await fetch("/api/reports", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ orgs, scopeLabel, payload: result }),
      });
      if (!res.ok) throw new Error(`Share failed (${res.status})`);
      const { id } = (await res.json()) as { id: string };
      const link = `${window.location.origin}/report/${id}`;
      setShareUrl(link);
      await navigator.clipboard.writeText(link).catch(() => {});
      showToast("Share link copied to clipboard");
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Share failed");
    } finally {
      setSharing(false);
    }
  }

  async function handleRunUserPublishes() {
    setUpError(null);
    const user = upUser.trim();
    if (!user) {
      setUpError("Enter an npm username.");
      return;
    }
    const extra = upUseCache && result?.recent ? result.recent.rows.map((r) => r.pkg) : [];
    setUpRunning(true);
    setUpResult(null);
    termRef.current?.clear();
    log(`→ user-publishes: ${user} (last ${upMonths} months)`);
    try {
      const failures = new FailureLog();
      const rep = await runUserPublishes(user, upMonths, jobs, extra, failures, log);
      if (failures.count > 0)
        log(
          `WARNING: ${failures.count} fetch(es) failed after retries — results may be INCOMPLETE.`,
        );
      setUpResult(rep);
    } catch (e) {
      log(`Error: ${e instanceof Error ? e.message : String(e)}`);
      setUpError(e instanceof Error ? e.message : "Lookup failed.");
    } finally {
      setUpRunning(false);
    }
  }

  const hasReports = !!(result && (result.recent || result.manual || result.external));

  return (
    <div className="app">
      <header className="masthead">
        <p className="eyebrow">supply-chain audit</p>
        <h1>
          <span className="pkg">npm</span> org trust &amp; access audit
        </h1>
        <p>
          Point this at any npm organizations to track trusted-publishing / provenance rollout, find
          packages published manually rather than via CI, and surface maintainers who can publish
          but aren&rsquo;t org members. Everything runs in your browser against the public npm
          registry &mdash; no data leaves the page.
        </p>
      </header>

      <div className="layout">
        {/* ---- configuration ---- */}
        <section className="panel">
          <div className="panel__head">
            <h2>Configuration</h2>
            <span className="hint">generic — supply your own orgs</span>
          </div>
          <div className="panel__body">
            <div className="field">
              <label>Organizations</label>
              <TagInput
                values={orgs}
                onChange={setOrgs}
                placeholder="e.g. netlify, gatsbyjs — Enter to add"
              />
              <p className="desc">
                One or more npm org slugs. The registry caps org listings at 250 packages
                (private/unlisted are not reachable unauthenticated).
              </p>
            </div>

            <div className="row">
              <div className="field">
                <label>Window (months)</label>
                <input
                  type="number"
                  min={1}
                  max={120}
                  value={months}
                  disabled={all}
                  onChange={(e) => setMonths(Number(e.target.value) || 1)}
                />
              </div>
              <div className="field">
                <label>Fetch concurrency</label>
                <input
                  type="number"
                  min={1}
                  max={32}
                  value={jobs}
                  onChange={(e) => setJobs(Number(e.target.value) || 1)}
                />
              </div>
            </div>

            <div className="field">
              <label className="toggle">
                <input type="checkbox" checked={all} onChange={(e) => setAll(e.target.checked)} />
                Analyze ALL org packages (ignore the recency window)
              </label>
            </div>

            <div className="field">
              <label>Reports</label>
              <div className="checks">
                {REPORT_META.map((r) => (
                  <label key={r.kind} className={`check${selected[r.kind] ? " active" : ""}`}>
                    <input
                      type="checkbox"
                      checked={selected[r.kind]}
                      onChange={(e) => setSelected((s) => ({ ...s, [r.kind]: e.target.checked }))}
                    />
                    <span>
                      <span className="ctitle">{r.title}</span>
                      <span className="cdesc">{r.desc}</span>
                    </span>
                  </label>
                ))}
              </div>
            </div>

            <div className="field">
              <label>Exclude bot / CI accounts (manual report)</label>
              <TagInput
                values={bots}
                onChange={setBots}
                placeholder="e.g. GitHub Actions, ci-bot — Enter to add"
              />
              <p className="desc">
                Publishers to treat as automation. Note: npm cannot distinguish a human from that
                human&rsquo;s CI token, so &ldquo;manual&rdquo; is a proxy, not proof.
              </p>
            </div>

            {selected.external && (
              <div className="field">
                <label>Org membership (for external report)</label>
                <p className="desc" style={{ marginTop: 0, marginBottom: 10 }}>
                  npm membership isn&rsquo;t public. Run these locally (you must be authenticated),
                  then paste the JSON output below:
                </p>
                {(orgs.length ? orgs : ["<org>"]).map((org) => (
                  <div className="cmd-row" key={org}>
                    <code className="cmd">npm org ls {org} --json</code>
                    <button
                      className="btn btn--sm btn--ghost"
                      onClick={() => {
                        navigator.clipboard
                          .writeText(`npm org ls ${org} --json`)
                          .then(() => showToast("Command copied"))
                          .catch(() => showToast("Clipboard unavailable"));
                      }}
                    >
                      Copy
                    </button>
                  </div>
                ))}
                <textarea
                  value={membersRaw}
                  onChange={(e) => setMembersRaw(e.target.value)}
                  placeholder={
                    "Paste output of `npm org ls <org> --json` here.\nMultiple orgs can be pasted one after another."
                  }
                />
                <p className="desc">
                  Parsed {members.length} member
                  {members.length === 1 ? "" : "s"}. Matching is case-insensitive. Refresh this
                  whenever membership changes.
                </p>
              </div>
            )}

            <div className="run-bar">
              <button className="btn btn--primary" onClick={handleRun} disabled={running}>
                {running ? "Running…" : "Run audit"}
              </button>
              {running && <span className="status">streaming to terminal →</span>}
            </div>
            {error && <p className="inline-error">{error}</p>}
          </div>
        </section>

        {/* ---- live terminal ---- */}
        <section>
          <GhosttyTerminal ref={termRef} />
          <p className="note">
            <strong>Live log</strong> rendered by{" "}
            <a href="https://github.com/coder/ghostty-web" target="_blank" rel="noreferrer">
              coder/ghostty-web
            </a>{" "}
            — Ghostty&rsquo;s VT100 parser compiled to WebAssembly. Progress mirrors the original
            shell scripts&rsquo; stderr. Failed fetches are retried with backoff and counted, so a
            rate-limited package never silently looks &ldquo;clean.&rdquo;
          </p>
        </section>
      </div>

      {/* ---- results ---- */}
      {hasReports && result && (
        <section className="results" id="reports">
          <div className="results__head">
            <h2>Audit results</h2>
            <span className="hint">switch between reports with the tabs below</span>
          </div>
          <div className="share-bar">
            <div>
              <strong className="share-bar__title">Share this report</strong>
              <span className="share-bar__hint">
                Saves a read-only snapshot and gives you a link anyone can open.
              </span>
            </div>
            <button className="btn btn--ghost" onClick={handleShare} disabled={sharing}>
              {sharing ? "Saving…" : shareUrl ? "Re-share" : "Share report"}
            </button>
          </div>
          {shareUrl && (
            <div className="share-link">
              <a href={shareUrl}>{shareUrl}</a>
              <button
                className="btn btn--sm btn--ghost"
                onClick={() => {
                  navigator.clipboard
                    .writeText(shareUrl)
                    .then(() => showToast("Link copied"))
                    .catch(() => showToast("Clipboard unavailable"));
                }}
              >
                Copy
              </button>
            </div>
          )}
          <ResultsView result={result} onToast={showToast} initialTab={firstTab} />
        </section>
      )}

      {/* ---- user publish history tool ---- */}
      <section className="panel" style={{ marginTop: 36 }}>
        <div className="panel__head">
          <h2>User publish history</h2>
          <span className="hint">standalone — by npm account</span>
        </div>
        <div className="panel__body">
          <p className="desc" style={{ marginTop: 0 }}>
            Versions a specific npm user personally published (recorded as the version&rsquo;s{" "}
            <code>_npmUser</code>) within the window. The package universe is the user&rsquo;s own
            maintained packages, optionally unioned with the packages from the last audit run.
          </p>
          <div className="row">
            <div className="field">
              <label>npm username</label>
              <input
                type="text"
                value={upUser}
                onChange={(e) => setUpUser(e.target.value)}
                placeholder="e.g. some-maintainer"
              />
            </div>
            <div className="field">
              <label>Window (months)</label>
              <input
                type="number"
                min={1}
                max={120}
                value={upMonths}
                onChange={(e) => setUpMonths(Number(e.target.value) || 1)}
              />
            </div>
          </div>
          <div className="field">
            <label className="toggle">
              <input
                type="checkbox"
                checked={upUseCache}
                onChange={(e) => setUpUseCache(e.target.checked)}
                disabled={!result?.recent}
              />
              Also scan packages from the last audit run
              {!result?.recent && " (run an audit first)"}
            </label>
          </div>
          <div className="run-bar">
            <button
              className="btn btn--primary"
              onClick={handleRunUserPublishes}
              disabled={upRunning}
            >
              {upRunning ? "Scanning…" : "Look up"}
            </button>
            {upRunning && <span className="status">streaming to terminal →</span>}
          </div>
          {upError && <p className="inline-error">{upError}</p>}
          {upResult && (
            <div style={{ marginTop: 22 }}>
              <UserPublishView report={upResult} onToast={showToast} />
            </div>
          )}
        </div>
      </section>

      <footer className="footer">
        Trust logic ported verbatim from{" "}
        <a href="https://github.com/43081j/packumeta" target="_blank" rel="noreferrer">
          packumeta
        </a>
        : staged publish &gt; trusted publisher (OIDC + provenance) &gt; provenance &gt; none.
        Discovery via fast-npm-meta (npm.antfu.dev); trust from per-version registry manifests;
        weekly downloads from api.npmjs.org. &ldquo;Recency&rdquo; is the latest dist-tag&rsquo;s
        publish time, not the newest version overall.
      </footer>

      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
