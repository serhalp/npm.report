import { FailureLog } from "#audit/npmClient";
import { discoverInScope, runExternal, runManual, runTrust, type LogFn } from "#audit/reports";
import type { AuditConfig, AuditResult, ReportKind } from "#shared/types";

/**
 * Top-level audit orchestration.
 *
 * `trust` and `manual` share one discovery pass: org list -> latest
 * version/recency -> in-scope subset. `manual` scans every org package for an
 * all-package audit, otherwise only the recency-filtered packages. `external`
 * ignores that cache and enumerates the full org package list directly because
 * dormant package maintainers still have live publish rights.
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
