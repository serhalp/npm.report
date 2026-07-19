import { FailureLog } from "./npmClient.ts";
import { discoverInScope, runExternal, runManual, runTrust, type LogFn } from "./reports.ts";
import type {
  AuditConfig,
  ExternalReport,
  FetchFailure,
  ManualReport,
  TrustReport,
  ReportKind,
} from "./types.ts";

export interface AuditResult {
  trust?: TrustReport;
  manual?: ManualReport;
  external?: ExternalReport;
  failures: FetchFailure[];
}

/**
 * Top-level orchestration mirroring npm-audit.sh's dispatch.
 *
 * `trust` and `manual` share one discovery pass (the recent-packages "cache":
 * org list -> latest version/recency -> in-scope subset). `manual` reads col1
 * of that cache — so under `-A` it scans every org package, otherwise only the
 * recency-filtered ones. `external` ignores the cache entirely and enumerates
 * the full org package list directly (a dormant package's maintainer still has
 * live publish rights).
 */
export async function runAudit(
  config: AuditConfig,
  reports: ReportKind[],
  members: string[],
  log: LogFn,
): Promise<AuditResult> {
  const failures = new FailureLog();
  const want = new Set(reports);
  const result: AuditResult = { failures: failures.failures };

  if (want.has("trust") || want.has("manual")) {
    const scope = await discoverInScope(config, failures, log);
    if (want.has("trust")) {
      result.trust = await runTrust(config, failures, log, scope);
    }
    if (want.has("manual")) {
      result.manual = await runManual(
        config,
        scope.map((s) => s.name),
        failures,
        log,
      );
    }
  }

  if (want.has("external")) {
    if (members.length === 0) {
      log("[external] SKIPPED: no org members supplied (membership isn't public)");
    } else {
      result.external = await runExternal(config, members, failures, log);
    }
  }

  if (failures.count > 0) {
    log(`WARNING: ${failures.count} fetch(es) failed after retries — results may be INCOMPLETE.`);
  }
  log("Done.");
  result.failures = failures.failures;
  return result;
}
