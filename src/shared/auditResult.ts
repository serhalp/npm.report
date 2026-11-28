import type { AuditResult } from "#shared/types";

export const NO_AUDIT_CONTENT_MESSAGE = "No matching packages were found for the selected orgs.";

/**
 * A report is worth persisting only when it found at least one package or
 * finding, or when a fetch failed. Saving an empty result would create a
 * shareable record (and a zero-point trust-history row) for a nonexistent org
 * or an org with no packages.
 */
export function hasAuditContent(result: AuditResult): boolean {
  if (result.failures.length > 0) return true;
  return (
    (result.trust?.summary.total ?? 0) > 0 ||
    (result.manual?.totalScanned ?? 0) > 0 ||
    (result.external?.scanned ?? 0) > 0
  );
}
