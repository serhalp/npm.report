export const DEFAULT_BOT_EXCLUSIONS = ["GitHub Actions"];
export const FETCH_CONCURRENCY = 12;

// A single report may audit at most this many orgs. Each org drives a full
// discovery + per-version-manifest + downloads sweep, so this bounds both the
// per-run server cost and the abuse blast radius. Enforced on the browser
// (App.svelte) and at the server trust boundary (AuditRequestSchema).
export const MAX_ORGS = 5;

// Orgs too large to audit within platform limits — their package list dwarfs a
// normal run and blows the budget. Blocked on both sides. Compared against the
// trimmed, lowercased slug.
export const BLOCKED_ORGS = new Set(["types"]);

export function isBlockedOrg(org: string): boolean {
  return BLOCKED_ORGS.has(org.trim().toLowerCase());
}

/** Easter-egg rejection shown (client + server) when someone tries a blocked org. */
export function blockedOrgMessage(org: string): string {
  return `"${org}" is DefinitelyTyped in a trenchcoat — thousands of packages posing as a single org. Auditing it would outlive us both, so it's blocked. Try a smaller org. 🧥`;
}
