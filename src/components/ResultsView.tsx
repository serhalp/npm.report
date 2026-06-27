import { useEffect, useMemo, useState } from "react";
import type { AuditResult } from "../lib/runAudit";
import type { ReportKind } from "../lib/types";
import { ExternalView, ManualView, RecentView } from "./ReportViews";

const TAB_META: { kind: ReportKind; title: string }[] = [
  { kind: "recent", title: "recent" },
  { kind: "manual", title: "manual" },
  { kind: "external", title: "external" },
];

// Tabs are linkable via the URL hash, e.g. /report/:id#manual. Each tab button
// carries an id matching its kind so the browser can scroll to it on load.
const hashKind = (): ReportKind | null => {
  if (typeof window === "undefined") return null;
  const h = window.location.hash.replace(/^#/, "");
  return TAB_META.some((t) => t.kind === h) ? (h as ReportKind) : null;
};

/** Tabbed render of a completed AuditResult — shared by the live app and the
 *  read-only /report/:id page. */
export function ResultsView({
  result,
  onToast,
  initialTab,
}: {
  result: AuditResult;
  onToast: (m: string) => void;
  initialTab?: ReportKind;
}) {
  const tabs = useMemo(
    () =>
      TAB_META.filter(
        (t) =>
          (t.kind === "recent" && result.recent) ||
          (t.kind === "manual" && result.manual) ||
          (t.kind === "external" && result.external),
      ),
    [result],
  );

  const [activeTab, setActiveTab] = useState<ReportKind>(() => {
    const fromHash = hashKind();
    if (fromHash && tabs.some((t) => t.kind === fromHash)) return fromHash;
    if (initialTab && tabs.some((t) => t.kind === initialTab)) return initialTab;
    return tabs[0]?.kind ?? "recent";
  });

  // Keep the active tab in sync with the hash for back/forward and manual edits.
  useEffect(() => {
    const onHashChange = () => {
      const k = hashKind();
      if (k && tabs.some((t) => t.kind === k)) setActiveTab(k);
    };
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, [tabs]);

  const selectTab = (kind: ReportKind) => {
    setActiveTab(kind);
    // Reflect the selection in the URL so it can be copied/shared, without the
    // scroll-jump or history spam that assigning location.hash would cause.
    window.history.replaceState(null, "", `#${kind}`);
  };

  if (tabs.length === 0) return null;

  return (
    <>
      <div className="tabs" role="tablist" aria-label="Audit reports">
        <span className="tabs__label">Reports</span>
        {tabs.map((t) => (
          <button
            key={t.kind}
            id={t.kind}
            role="tab"
            aria-selected={activeTab === t.kind}
            className={`tab${activeTab === t.kind ? " active" : ""}`}
            onClick={() => selectTab(t.kind)}
          >
            {t.title}
            <span className="count">
              {t.kind === "recent" && result.recent?.summary.total}
              {t.kind === "manual" && result.manual?.rows.length}
              {t.kind === "external" && result.external?.distinctUsers}
            </span>
          </button>
        ))}
      </div>
      {activeTab === "recent" && result.recent && (
        <RecentView report={result.recent} onToast={onToast} />
      )}
      {activeTab === "manual" && result.manual && (
        <ManualView report={result.manual} onToast={onToast} />
      )}
      {activeTab === "external" && result.external && (
        <ExternalView report={result.external} onToast={onToast} />
      )}
      {result.failures.length > 0 && (
        <p className="inline-error" style={{ marginTop: 18 }}>
          {result.failures.length} fetch(es) failed after retries — results may be INCOMPLETE.
        </p>
      )}
    </>
  );
}
