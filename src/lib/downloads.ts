import { chunk } from "./concurrency";
import { FailureLog, npmGetJson, sleep } from "./npmClient";

// ---------------------------------------------------------------------------
// Weekly downloads — ported from npm-audit.sh `add_downloads`.
//
// api.npmjs.org downloads is a STRICT token bucket: ~5 requests then 429,
// regardless of concurrency; it refills fine paced at ~2 req/s. The BULK
// endpoint (comma-separated, up to 128) only accepts UNSCOPED names — scoped
// names 400. So:
//   - unscoped: bulk, 100 per request (free)
//   - scoped:   sequential + 500ms delay (do NOT parallelize)
// Missing/failed lookups become null ("?" in the shell version).
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
    );
    if (json) {
      if (typeof json.downloads === "number" && typeof json.package === "string") {
        // single-name flat response
        map.set(json.package, json.downloads);
      } else {
        for (const [key, val] of Object.entries(json)) {
          const v = val as { downloads?: number } | null;
          if (v && typeof v.downloads === "number") map.set(key, v.downloads);
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
    );
    if (json && typeof json.downloads === "number") map.set(p, json.downloads);
    done++;
    onProgress?.(done, total);
    await sleep(500);
  }

  return map;
}
