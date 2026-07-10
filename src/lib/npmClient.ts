/* eslint-disable no-await-in-loop -- Retry/backoff must wait between attempts; parallelizing retries would violate rate-limit handling. */
import type { FetchFailure } from "./types";

// ---------------------------------------------------------------------------
// npm_get — direct port of the bash helper shared by both scripts.
//
// The whole point of this helper is the "no silent failure" invariant from the
// original scripts: a rate-limited package must NOT look "clean", because that
// is the dangerous failure mode for a security audit. So:
//   - 2xx           -> body text
//   - 404           -> null (legitimately empty, no retry)
//   - 429/5xx/net   -> retry up to `tries` with 1,4,9,16s backoff, then record
//                      the URL in the failure log and return null
//   - other codes   -> record failure, return null
//
// Downstream code treats null as "empty" (same as the jq pipelines did), but
// the failure log lets the UI surface "WARNING: N fetch(es) failed — results
// may be INCOMPLETE."
// ---------------------------------------------------------------------------

export class FailureLog {
  readonly failures: FetchFailure[] = [];
  add(url: string, reason: string) {
    this.failures.push({ url, reason });
  }
  get count() {
    return this.failures.length;
  }
}

export const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

// A server that bothers to send Retry-After could in theory name a huge delay
// (a minutes-long HTTP-date). Cap what we honor so one hostile/buggy header
// can't hang the whole audit; past this we fall back to retrying on our own
// schedule.
const MAX_RETRY_AFTER_MS = 60_000;

/**
 * How long to wait before the next retry attempt.
 *
 * Honors a server-sent `Retry-After` header when present — that is the host
 * telling us exactly when its rate-limit bucket refills, so it beats guessing.
 * RFC 7231 allows two forms and we accept both: a delta-seconds integer
 * (`Retry-After: 5`) or an HTTP-date (`Retry-After: Wed, 21 Oct 2026 ...`).
 * When the header is absent or unparseable we fall back to the original
 * 1,4,9,16s quadratic backoff. The honored value is clamped to
 * MAX_RETRY_AFTER_MS so a wildly large delay can't stall the run.
 */
export function retryDelayMs(retryAfter: string | null, attempt: number): number {
  const backoff = attempt * attempt * 1000; // 1s, 4s, 9s, 16s
  if (retryAfter) {
    let ms: number | null = null;
    const secs = Number(retryAfter);
    if (Number.isFinite(secs)) {
      ms = secs * 1000;
    } else {
      const when = Date.parse(retryAfter);
      if (!Number.isNaN(when)) ms = when - Date.now();
    }
    if (ms !== null && ms > 0) return Math.min(ms, MAX_RETRY_AFTER_MS);
  }
  return backoff;
}

// Audits run server-side (edge functions), so npm is fetched directly — the
// browser CORS proxies are gone.
export async function npmGet(url: string, failures: FailureLog, tries = 5): Promise<string | null> {
  let i = 0;
  for (;;) {
    i++;
    let code = 0;
    let retryAfter: string | null = null;
    try {
      const res = await fetch(url, { headers: { Accept: "application/json" } });
      code = res.status;
      if (code >= 200 && code < 300) return await res.text();
      if (code === 404) return null;
      // Grab the host's own retry guidance (Retry-After on a non-2xx) so the
      // backoff below can honor it instead of guessing.
      retryAfter = res.headers.get("retry-after");
    } catch {
      code = 0; // network error / CORS / abort
    }
    if (code === 429 || (code >= 500 && code < 600) || code === 0) {
      if (i >= tries) {
        failures.add(url, `http ${code}`);
        return null;
      }
      await sleep(retryDelayMs(retryAfter, i));
      continue;
    }
    // Any other status: a hard failure, don't retry.
    failures.add(url, `http ${code}`);
    return null;
  }
}

/**
 * Convenience: npm_get + JSON.parse. An empty body (null / "") is a
 * legitimately-empty result and returns null silently. But a NON-empty body
 * that fails to parse (e.g. a 200 HTML rate-limit interstitial) is NOT empty —
 * treating it as such would silently zero out an audit, so it's recorded in the
 * FailureLog per the "no silent failure" invariant, matching discovery.ts.
 */
export async function npmGetJson<T = unknown>(
  url: string,
  failures: FailureLog,
  tries = 5,
): Promise<T | null> {
  const body = await npmGet(url, failures, tries);
  if (!body) return null;
  try {
    return JSON.parse(body) as T;
  } catch {
    failures.add(url, "unparseable JSON response");
    return null;
  }
}

/** Registry doc URL for a package name (scoped names get '/' -> %2f). */
export function pkgUrl(name: string): string {
  return `https://registry.npmjs.org/${name.replace("/", "%2f")}`;
}

/** Per-version manifest URL (lightweight, ~KBs vs MBs for a full packument). */
export function versionUrl(name: string, version: string): string {
  return `https://registry.npmjs.org/${name.replace("/", "%2f")}/${version}`;
}

/** epoch seconds for an ISO-8601 timestamp; NaN-safe (returns null on bad input). */
export function toEpoch(iso: string): number | null {
  const ms = Date.parse(iso);
  return Number.isNaN(ms) ? null : Math.floor(ms / 1000);
}
