/* eslint-disable no-await-in-loop -- Discovery intentionally resolves orgs and fast-npm-meta batches in a bounded sequence so failures stay attributable and upstream request shape matches the shell reference. */
import { chunk } from "./concurrency.ts";
import { FailureLog, npmGet, npmGetJson } from "./npmClient.ts";
import type { PkgMeta } from "./types.ts";

// ---------------------------------------------------------------------------
// Org package discovery and fast-npm-meta batch metadata resolution.
// ---------------------------------------------------------------------------

/**
 * All packages across the given orgs, deduped & sorted.
 *
 * registry.npmjs.org/-/org/<org>/package hard-caps at 250 (alphabetical) and
 * ignores every pagination param — orgs larger than 250 lose the tail, and
 * those are private/unlisted/unreachable unauthenticated anyway. Documented
 * limitation, surfaced to the user in the UI.
 */
export async function listOrgPackages(orgs: string[], failures: FailureLog): Promise<string[]> {
  const seen = new Set<string>();
  for (const org of orgs) {
    const slug = org.trim();
    if (!slug) continue;
    const obj = await npmGetJson<Record<string, unknown>>(
      `https://registry.npmjs.org/-/org/${encodeURIComponent(slug)}/package`,
      failures,
      5,
    );
    if (obj && typeof obj === "object") {
      for (const name of Object.keys(obj)) seen.add(name);
    }
  }
  return [...seen].toSorted();
}

interface FastMetaItem {
  name?: string;
  version?: string;
  publishedAt?: string;
  deprecated?: unknown;
  error?: unknown;
}

/**
 * Resolve latest version + publishedAt + deprecated for each package via
 * fast-npm-meta (npm.antfu.dev), batched. Names are joined with '+'; scoped
 * names keep their literal slash. The audit contract deliberately has no
 * registry fallback for this discovery step.
 *
 * Chunked at 100 (the upstream swallowed ~400 names in one URL, but 100 is the
 * documented safety margin).
 */
export async function resolveMeta(
  pkgs: string[],
  failures: FailureLog,
  onProgress?: (done: number, total: number) => void,
): Promise<PkgMeta[]> {
  const groups = chunk(pkgs, 100);
  const out: PkgMeta[] = [];
  let done = 0;
  for (const grp of groups) {
    const url = `https://npm.antfu.dev/${grp.join("+")}?metadata=true`;
    const body = await npmGet(url, failures, 5);
    done += grp.length;
    onProgress?.(Math.min(done, pkgs.length), pkgs.length);
    if (!body) continue; // npmGet already recorded the exhausted failure
    let parsed: unknown;
    try {
      parsed = JSON.parse(body);
    } catch {
      // A 200 with an unparseable body (e.g. an HTML rate-limit interstitial)
      // is NOT a legitimately-empty result. Per the "no silent failure"
      // invariant, flag it so the UI warns instead of silently reporting
      // "0 in scope".
      failures.add(url, "unparseable fast-npm-meta response");
      continue;
    }
    const items: FastMetaItem[] = Array.isArray(parsed)
      ? (parsed as FastMetaItem[])
      : [parsed as FastMetaItem];
    let resolved = 0;
    for (const it of items) {
      if (!it || !it.name || !it.version) continue; // drop unresolvable rows
      resolved++;
      out.push({
        name: it.name,
        version: it.version,
        publishedAt: it.publishedAt ?? "",
        deprecated: it.deprecated != null && it.deprecated !== false,
      });
    }
    // fast-npm-meta answers a rate-limited or over-large batch with a 200 error
    // object (or all-error items). Resolving zero usable rows from a non-empty
    // batch means discovery failed for that batch; record it rather than let the
    // audit silently show "0 in scope" as if the org were empty.
    if (resolved === 0 && grp.length > 0) {
      failures.add(url, "fast-npm-meta resolved no packages for batch");
    }
  }
  return out;
}
