import { useEffect, useState } from "react";
import { ResultsView } from "./components/ResultsView";
import type { AuditResult } from "./lib/runAudit";

interface ReportRecord {
  id: string;
  orgs: string;
  scopeLabel: string;
  payload: AuditResult;
  createdAt: string | null;
}

/** Read-only page for a shared audit at /report/:id. Fetches the stored report
 *  and renders it with the same views as the live app. */
export default function SharedReport({ id }: { id: string }) {
  const [record, setRecord] = useState<ReportRecord | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2200);
    return () => clearTimeout(t);
  }, [toast]);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/reports/${encodeURIComponent(id)}`)
      .then(async (res) => {
        if (res.status === 404) throw new Error("This report could not be found.");
        if (!res.ok) throw new Error(`Failed to load report (${res.status}).`);
        return res.json() as Promise<ReportRecord>;
      })
      .then((rec) => {
        if (!cancelled) setRecord(rec);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load report.");
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  const when = record?.createdAt ? new Date(record.createdAt).toISOString().slice(0, 10) : null;

  return (
    <div className="app">
      <header className="masthead">
        <p className="eyebrow">supply-chain audit · shared report</p>
        <h1>
          <span className="pkg">npm</span> org trust &amp; access audit
        </h1>
        {record && (
          <p>
            Audit of <strong>{record.orgs || "npm packages"}</strong>
            {record.scopeLabel ? ` — ${record.scopeLabel}` : ""}
            {when ? `, generated ${when}` : ""}. This is a read-only snapshot.{" "}
            <a href="/">Run your own audit →</a>
          </p>
        )}
      </header>

      {error && (
        <section className="panel">
          <div className="panel__body">
            <p className="inline-error" style={{ marginTop: 0 }}>
              {error}
            </p>
            <p className="desc">
              <a href="/">Back to the audit tool →</a>
            </p>
          </div>
        </section>
      )}

      {!record && !error && (
        <section className="panel">
          <div className="panel__body">
            <p className="desc" style={{ marginTop: 0 }}>
              Loading report…
            </p>
          </div>
        </section>
      )}

      {record && (
        <section className="results">
          <ResultsView result={record.payload} onToast={setToast} />
        </section>
      )}

      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
