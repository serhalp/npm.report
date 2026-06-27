// A tiny p-limit: run at most `concurrency` thunks at once. Replaces the
// `xargs -P JOBS` parallelism from the shell scripts. Used for registry fetches
// (default 12). NOTE: scoped-download pacing deliberately does NOT use this —
// the api.npmjs.org token bucket needs sequential + delay, not concurrency.

export function pLimit(concurrency: number) {
  const limit = Math.max(1, Math.floor(concurrency));
  let active = 0;
  const queue: (() => void)[] = [];

  const next = () => {
    active--;
    const run = queue.shift();
    if (run) run();
  };

  return function <T>(fn: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const run = () => {
        active++;
        fn().then(resolve, reject).finally(next);
      };
      if (active < limit) run();
      else queue.push(run);
    });
  };
}

/** Map over items with bounded concurrency, preserving order. */
export async function mapLimit<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const limit = pLimit(concurrency);
  return Promise.all(items.map((item, i) => limit(() => fn(item, i))));
}

/** Split an array into chunks of at most `size`. */
export function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}
