# AGENTS.md

Architecture and conventions for this project. Read before editing.

## What this is

A static, **client-side** browser app that audits npm organizations for
supply-chain risk. It is a TypeScript port of two bash scripts. The originals
live in `scripts/` and are the **reference specification** — when changing audit
behavior, diff against them and preserve their documented semantics.

There is **no application backend** for the audit itself. The audit logic all
runs in the browser. The one server-side piece for npm access is a set of thin
**per-host edge proxies** in `netlify/edge-functions/` (shared core in
`netlify/lib/npm-proxy.ts`, kept outside the edge-functions dir so the bundler
doesn't treat it as a function): registry.npmjs.org stopped reliably sending
`Access-Control-Allow-Origin: *`, so direct browser fetches now fail CORS. Each
proxy adds the CORS header and a 5-minute shared cache in front of one npm host —
`npm-registry-proxy` (registry.npmjs.org), `npm-downloads-proxy` (api.npmjs.org),
`npm-meta-proxy` (npm.antfu.dev / fast-npm-meta). They must stay **edge
functions, not serverless functions** — edge streams the upstream body through,
so it keeps neither the function timeout nor the 6 MB response cap that the
client-side design exists to avoid (a single packument can be 23 MB). Do not turn
them into serverless proxies.

**Each proxy pins ONE upstream host (a hardcoded literal), never read from the
request** — there is no `?url=` parameter, so the proxies cannot be steered to an
arbitrary host (no open relay / SSRF). The upstream resource travels in the proxy
URL's **path** (after the fixed `/api/npm-*` mount), reconstructed verbatim so
scoped `%2f` and fast-npm-meta `+` separators survive; the core rejects path
traversal (`..`, encoded or not) and control characters. Carrying the resource in
the path (rather than a query param) also gives every upstream object a distinct
request path, so the CDN cache keys them apart — the earlier single-path `?url=`
proxy could replay one cached body for a different resource. The client maps each
host to its mount in `npmClient.ts` (`proxied()`); when adding a new upstream host
add a new per-host proxy, do not make any proxy host-generic.

**Report sharing** is the one stateful feature. A serverless function
(`netlify/functions/reports.ts`) persists a completed audit to the Netlify
Database (managed Postgres via Drizzle; schema in `db/schema.ts`, client in
`db/index.ts`) and serves it back. `POST /api/reports` stores the `AuditResult`
plus a config snapshot and returns a human-readable slug id
(`<orgs>-<yyyy-mm-dd>-<shorthash>`, content-hashed so re-sharing is idempotent);
`GET /api/reports/:id` returns the row. The client renders `/report/:id`
read-only via a tiny path check in `main.tsx` (`SharedReport.tsx` + the shared
`components/ResultsView.tsx`). This payload is small JSON (not a packument), so a
serverless function is correct here — the edge-vs-serverless rule above is
specifically about the npm proxy.

## Layout

```
index.html              Vite entry; loads IBM Plex fonts
netlify.toml            static publish of dist/ + SPA redirect
scripts/                ORIGINAL bash scripts — reference spec, not executed
src/
  main.tsx              React root
  App.tsx               page shell, all state, run orchestration
  styles.css            design system (CSS variables; dark "operator console")
  lib/
    types.ts            shared types; field names mirror the scripts' TSV columns
    npmClient.ts        npmGet (retry/backoff + FailureLog), toEpoch, URL helpers
    concurrency.ts      pLimit / mapLimit / chunk (replaces `xargs -P`)
    trust.ts            packumeta getTrustStatus/getTrustLevelName (verbatim)
    discovery.ts        org package listing + fast-npm-meta batch resolve
    downloads.ts        weekly downloads (bulk unscoped + paced scoped)
    members.ts          parse `npm org ls <org> --json` (or a plain user list)
    reports.ts          runRecent / runManual / runExternal / runUserPublishes
    runAudit.ts         top-level dispatch shared by recent + manual
    export.ts           copy-JSON + download-CSV helpers
  components/
    GhosttyTerminal.tsx ghostty-web wrapper + ANSI colorizer + <pre> fallback
    DataTable.tsx       generic click-to-sort table
    TagInput.tsx        chip multi-value input (orgs, bots)
    ExportButtons.tsx   per-report Copy JSON / Download CSV
    ReportViews.tsx     Recent/Manual/External/UserPublish view components
```

## Invariants to preserve (these bit the original author; don't regress them)

- **No silent failure.** `npmGet` retries 429/5xx/network honoring a server-sent
  `Retry-After` delay when the host provides one (the edge proxy forwards it on
  non-2xx), otherwise 1,4,9,16s backoff; treats 404 as legitimately-empty, and
  records exhausted/odd failures in a `FailureLog`. The UI surfaces "N fetch(es)
  failed — results may be INCOMPLETE." A rate-limited package must never look
  "clean."
- **Trust logic is verbatim from packumeta** (`src/lib/trust.ts`): provenance =
  `dist.attestations.provenance` truthy; trustedPublisher = `_npmUser.trustedPublisher`
  truthy; stagedPublish = `_npmUser.approver` truthy; level staged(3) >
  trustedPublisher(2 = tp && prov) > provenance(1) > none(0). `truthy` mirrors
  jq: `!= null && != false`.
- **Recency = the `latest` dist-tag's `publishedAt`**, not the max over all
  version times. Trust/deprecated are computed on the `latest` version.
- **Discovery has no registry fallback** — latest version / recency / deprecated
  come only from fast-npm-meta (`npm.antfu.dev`), batched (chunked at 100, names
  joined with `+`, scoped names keep a literal slash).
- **Lightweight manifests for trust.** Trust uses the per-version manifest
  (`registry.npmjs.org/<pkg>/<version>`, ~KBs). Only `manual` and user-publishes
  pull the full packument (needs every version's `_npmUser`).
- **Downloads pacing.** `api.npmjs.org` is a strict token bucket: unscoped names
  go through the bulk endpoint (100/req); scoped names are fetched **sequentially
  with a 500 ms delay** (bulk rejects scoped, and parallel scoped 429s). Do not
  parallelize scoped downloads.
- **`recent` and `manual` share one discovery pass.** `manual` scans col-1 of
  that "cache" (so `-A`/all → every package; window → recency-filtered only).
  `external` ignores the cache and enumerates the org list directly (a dormant
  package's maintainer still has live rights).
- **Nothing is hardcoded to a specific org/user/package.** It's a generic tool;
  orgs, bots, and members are all user input.

## Build / type-checking

`npm run build` is `vite build` (esbuild) — it transpiles without type-checking,
so type errors won't fail the build. Keep types honest anyway; run
`npx tsc --noEmit` locally if you want a real check. Do not run build/dev/tsc as
part of automated edits — the platform validates the build.

## ghostty-web notes

- Imports `init`, `Terminal`, `FitAddon` from `ghostty-web` (v0.4.0). The WASM is
  inlined as a base64 data URL in the ESM build, so `await init()` needs no args
  and there's no `.wasm` asset to copy.
- The terminal is for display only (live progress log); it does not run anything.
- If WASM init fails, `GhosttyTerminal` falls back to a `<pre>` mirror so the log
  is never lost.

## Adding a report

1. Add types to `types.ts`.
2. Add a `runX` orchestrator to `reports.ts` (take `FailureLog` + `LogFn`).
3. Wire it into `runAudit.ts` and the `ReportKind` union.
4. Add a view to `ReportViews.tsx` and a tab in `App.tsx`.
