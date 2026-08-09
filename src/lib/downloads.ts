/* eslint-disable no-await-in-loop -- api.npmjs.org has a strict token bucket; scoped downloads must remain sequential and paced. */
import { chunk } from "./concurrency.ts";
import { FailureLog, npmGetJson, sleep } from "./npmClient.ts";

// ---------------------------------------------------------------------------
// Weekly download retrieval and pacing contract.
//
// api.npmjs.org downloads is a strict token bucket: ~5 requests then 429,
// regardless of concurrency; it refills fine paced at ~2 req/s. The bulk
// endpoint (comma-separated, up to 128) only accepts unscoped names — scoped
// names 400. So:
//   - unscoped: bulk, 100 per request (free)
//   - scoped:   sequential + 500ms delay (do NOT parallelize)
// A package the endpoint returns a null entry for is a real zero (0 downloads).
// Only a failed/absent fetch stays unknown (renders as "?").
// ---------------------------------------------------------------------------

interface BulkResp {
  // single-name responses are flat {package, downloads}; multi-name responses
  // are keyed by package: { "<name>": {downloads, package} | null }
  downloads?: number;
  package?: string;
  [key: string]: unknown;
}

export async function fetchWeeklyDownloads(
  names: string[],
  failures: FailureLog,
  onProgress?: (done: number, total: number) => void,
): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  const unscoped = names.filter((n) => !n.startsWith("@"));
  const scoped = names.filter((n) => n.startsWith("@"));
  let done = 0;
  const total = names.length;

  // Unscoped: bulk, 100 per request.
  for (const batch of chunk(unscoped, 100)) {
    if (batch.length === 0) continue;
    const json = await npmGetJson<BulkResp>(
      `https://api.npmjs.org/downloads/point/last-week/${batch.join(",")}`,
      failures,
      5,
    );
    if (json) {
      if (typeof json.downloads === "number" && typeof json.package === "string") {
        // single-name flat response
        map.set(json.package, json.downloads);
      } else {
        for (const [key, val] of Object.entries(json)) {
          const v = val as { downloads?: number } | null;
          // A present-but-null entry means npm has the package but zero weekly
          // downloads. Record it as 0; a missing entry stays "?".
          map.set(key, v && typeof v.downloads === "number" ? v.downloads : 0);
        }
      }
    }
    done += batch.length;
    onProgress?.(done, total);
  }

  // Scoped: sequential + paced to stay under the token bucket.
  for (const p of scoped) {
    const json = await npmGetJson<{ downloads?: number }>(
      `https://api.npmjs.org/downloads/point/last-week/${p}`,
      failures,
      5,
    );
    // A fetched response with a non-numeric count is a real 0; only a failed
    // fetch (json === null) stays unknown.
    if (json) map.set(p, typeof json.downloads === "number" ? json.downloads : 0);
    done++;
    onProgress?.(done, total);
    await sleep(500);
  }

  return map;
}
