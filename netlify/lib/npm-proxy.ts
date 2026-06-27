// ---------------------------------------------------------------------------
// npm-proxy core — shared by the per-host edge proxies in ../edge-functions/.
//
// This file lives OUTSIDE the edge-functions directory on purpose: Netlify's
// bundler treats every file inside that directory as an edge function (it does
// NOT honour an `_` prefix), so a helper module placed there fails to load and
// takes the whole bundle down with it. Keeping it a sibling module that the
// functions import keeps it from being mounted on a path of its own.
//
// Why this exists: registry.npmjs.org stopped reliably sending
// `Access-Control-Allow-Origin: *`, so direct browser fetches fail CORS. Each
// caller (npm-registry-proxy, npm-downloads-proxy, npm-meta-proxy) is a thin
// wrapper that pins ONE upstream host and forwards through here.
//
// Security model (deliberate — see AGENTS.md):
//   - The upstream host is a hardcoded argument, NEVER read from the request.
//     There is no `?url=` parameter and nothing the caller sends can change
//     which host we talk to, so this can't be turned into an open relay / SSRF
//     pivot.
//   - The upstream resource is carried in the URL *path* after a fixed mount
//     prefix. We reconstruct it verbatim (preserving `%2f` in scoped names and
//     the `+` separators fast-npm-meta uses) and reject path-traversal (`..`)
//     and control characters before fetching.
//   - Carrying the resource in the path also gives every upstream object a
//     distinct request path, so the CDN cache keys them apart. The previous
//     single-path `?url=` design let one cached body be replayed for a
//     different resource.
//
// An edge function — not a serverless function — is used on purpose: it streams
// the upstream body straight through, so it has no 6 MB response cap and no
// memory blow-up on the large packuments the `manual` / user-publishes reports
// fetch (a single packument can be 23 MB).
// ---------------------------------------------------------------------------

/**
 * Reject anything that could escape the pinned host's path or smuggle bytes.
 * Control chars (<= 0x20), DEL (0x7f), and backslash never appear in a
 * legitimate npm resource path — the client always percent-encodes — so any of
 * them is a tampering signal. Then decode (so `%2e%2e` -> `..`, `%2f` -> `/`)
 * and reject any `..` segment so traversal can't hide behind encoding.
 */
function isSafeResourcePath(rest: string): boolean {
  for (let i = 0; i < rest.length; i++) {
    const c = rest.charCodeAt(i)
    if (c <= 0x20 || c === 0x7f || c === 0x5c /* backslash */) return false
  }
  let decoded: string
  try {
    decoded = decodeURIComponent(rest)
  } catch {
    return false // malformed percent-encoding
  }
  return !decoded.split('/').includes('..')
}

/**
 * Proxy a single GET to a FIXED upstream `host`. `prefix` is the mount path of
 * the calling edge function (e.g. `/api/npm-registry`); everything after it is
 * the upstream path, reconstructed verbatim and appended to `host`.
 */
export async function proxyNpm(
  req: Request,
  host: string,
  prefix: string,
): Promise<Response> {
  if (req.method !== 'GET') {
    return new Response('method not allowed', { status: 405 })
  }

  const incoming = new URL(req.url)
  // `pathname` preserves `%2f` / `+` exactly as sent, which scoped names and
  // fast-npm-meta batches depend on.
  const rest = incoming.pathname.slice(prefix.length)

  if (!isSafeResourcePath(rest)) {
    return new Response('invalid resource path', { status: 400 })
  }

  // Host is hardcoded into the authority before the first `/`, so nothing in
  // `rest` can alter it. We still re-verify after parsing as defense in depth.
  let upstream: URL
  try {
    upstream = new URL(`https://${host}${rest}${incoming.search}`)
  } catch {
    return new Response('invalid resource path', { status: 400 })
  }
  if (upstream.protocol !== 'https:' || upstream.hostname !== host) {
    return new Response('host not allowed', { status: 403 })
  }

  let res: Response
  try {
    res = await fetch(upstream.toString(), {
      headers: { Accept: 'application/json' },
    })
  } catch {
    // Network error reaching npm — surface a 502 so the client's retry/backoff
    // kicks in rather than treating it as a legitimately-empty result.
    return new Response('upstream fetch failed', { status: 502 })
  }

  // Own the response headers: add CORS, set caching, and forward nothing
  // hop-by-hop. Status and body stream through unchanged.
  const headers = new Headers()
  const contentType = res.headers.get('content-type')
  if (contentType) headers.set('content-type', contentType)
  headers.set('access-control-allow-origin', '*')

  if (res.ok) {
    // Cache only SUCCESSFUL responses, keyed by this resource's distinct path
    // (plus query) for 5 minutes on the Netlify CDN.
    headers.set('cache-control', 'public, max-age=300')
    headers.set('netlify-cdn-cache-control', 'public, durable, max-age=300')
    headers.set('netlify-vary', 'query')
  } else {
    // Never cache a non-2xx (404 / 429 rate-limit / 5xx). The npm hosts —
    // especially api.npmjs.org's token bucket and the free fast-npm-meta
    // service — return transient 429s under load; caching one would replay it
    // to every retry and re-run, defeating the client's retry/backoff and
    // turning a momentary blip into a sticky, silent "everything looks empty"
    // audit. Force the client straight back to upstream instead.
    headers.set('cache-control', 'no-store')
    // Forward the host's own Retry-After so the client can honor the exact
    // delay it asks for instead of guessing. (Same-origin /api/* fetch, so the
    // browser can read this without Access-Control-Expose-Headers.)
    const retryAfter = res.headers.get('retry-after')
    if (retryAfter) headers.set('retry-after', retryAfter)
  }

  return new Response(res.body, { status: res.status, headers })
}
