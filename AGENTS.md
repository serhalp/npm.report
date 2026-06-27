# AGENTS.md

Architecture and rules for agents editing this project.

## Project Shape

This is a browser app for npm supply-chain audits. It is a TypeScript port of
two shell scripts in `scripts/`; those scripts are the reference specification
for audit behavior. When changing audit semantics, diff against the scripts and
preserve their documented behavior unless the user explicitly asks otherwise.

The audit itself is client-side. The browser orchestrates package discovery,
trust checks, downloads lookups, manual-publish scans, and external-maintainer
checks. Do not add a backend audit worker.

Server-side code exists only for narrow Netlify integration:

- Netlify edge functions in `netlify/edge-functions/` proxy npm hosts for CORS,
  response streaming, and short CDN caching.
- `netlify/lib/npm-proxy.ts` contains the shared proxy core and intentionally
  lives outside `netlify/edge-functions/` so Netlify does not mount it as a
  function.
- `netlify/functions/reports.ts` is a serverless function for sharing completed
  small JSON reports through Netlify Database. It is not used for npm packument
  proxying or audit execution.

## npm Proxy Rules

Keep the npm proxies as edge functions, not serverless functions. Edge functions
stream upstream bodies and avoid both serverless timeouts and response-size caps;
full packuments can be large.

Each proxy pins exactly one upstream host as a hardcoded literal:

- `npm-registry-proxy` -> `registry.npmjs.org`
- `npm-downloads-proxy` -> `api.npmjs.org`
- `npm-meta-proxy` -> `npm.antfu.dev`

Do not read an upstream host from the request. There must be no host-generic
`?url=` proxy and no open relay or SSRF surface.

The upstream resource is carried in the proxy path after the fixed `/api/npm-*`
mount. Preserve scoped package `%2f`, fast-npm-meta `+` separators, and query
strings. The shared proxy core rejects control characters, backslashes, malformed
encoding, and decoded `..` path segments. Keeping the resource in the path also
keeps CDN cache keys distinct per upstream object.

The client-side host mapping is in `src/lib/npmClient.ts` (`proxied()`). When
adding a new npm upstream host, add a new per-host edge proxy and a matching
client mapping.

## Report Sharing

Report sharing is opt-in and stateful. `POST /api/reports` stores a completed
`AuditResult` plus display metadata (`orgs`, `scopeLabel`) in Netlify Database
and returns an id of the form `<orgs>-<yyyy-mm-dd>-<shorthash>`. The hash is
derived from the payload, so re-sharing the same report on the same day is
idempotent. `GET /api/reports/:id` returns the stored row.

The client detects `/report/:id` in `src/main.ts`, renders
`src/SharedReport.svelte`, and reuses `components/ResultsView.svelte` for the read-only
snapshot.

This payload is small JSON, so a serverless function is appropriate here. The
edge-vs-serverless rule is specifically about npm proxying.

## Layout

```text
index.html              Vite entry; loads IBM Plex fonts
netlify.toml            Netlify static publish of dist/ plus SPA redirect
scripts/                Original shell scripts; behavior reference, not executed
db/                     Drizzle schema and Netlify Database connection
netlify/
  edge-functions/       Per-host npm edge proxies
  functions/            Report sharing API
  lib/npm-proxy.ts      Shared proxy core
src/
  main.ts               Svelte root and tiny /report/:id path switch
  App.svelte            Live audit UI, state, run orchestration, sharing trigger
  SharedReport.svelte   Read-only shared report route
  styles.css            Design system and app styling
  lib/
    types.ts            Shared types; field names mirror script TSV columns
    npmClient.ts        npmGet, retry/backoff, FailureLog, URL helpers
    concurrency.ts      pLimit, mapLimit, chunk
    trust.ts            packumeta trust logic
    discovery.ts        Org listing and fast-npm-meta batch resolve
    downloads.ts        Weekly downloads, including paced scoped lookups
    members.ts          Parse npm org ls JSON or a plain member list
    reports.ts          Report-specific orchestration
    runAudit.ts         Top-level audit dispatch
    export.ts           Copy JSON and CSV download helpers
  components/
    GhosttyTerminal.svelte Display-only progress terminal with pre fallback
    DataTable.svelte       Generic sortable table
    TagInput.svelte        Chip multi-value input
    ExportButtons.svelte   Per-report export controls
    RecentView.svelte      Recent report view
    ManualView.svelte      Manual report view
    ExternalView.svelte    External report view
    UserPublishView.svelte User publish-history view
    ResultsView.svelte     Shared tabbed report renderer
```

## Invariants

- No silent failure. `npmGet` retries 429, 5xx, and network failures. It honors a
  valid `Retry-After` header, otherwise uses 1, 4, 9, and 16 second backoff.
  Exhausted or unexpected failures go into `FailureLog`; the UI warns that
  results may be incomplete. 404 is treated as legitimately empty.
- Trust logic in `src/lib/trust.ts` mirrors packumeta: provenance is
  `dist.attestations.provenance` truthy; trusted publisher is
  `_npmUser.trustedPublisher` truthy; staged publish is `_npmUser.approver`
  truthy. Ordering is staged publish > trusted publisher with provenance >
  provenance > none. Truthy means not `null` and not `false`.
- Recency means the `latest` dist-tag's `publishedAt`, not the maximum timestamp
  across every version. Trust and deprecation status are computed for `latest`.
- Discovery has no registry fallback. Latest version, recency, and deprecation
  come from fast-npm-meta (`npm.antfu.dev`), batched in chunks of 100 with names
  joined by `+`; scoped names keep a literal slash.
- Trust checks use lightweight per-version manifests
  (`registry.npmjs.org/<pkg>/<version>`). Only `manual` and user-publishes fetch
  full packuments because they need per-version `_npmUser` data.
- Downloads from `api.npmjs.org` are paced deliberately. Unscoped packages use
  the bulk endpoint in batches of 100. Scoped packages are fetched sequentially
  with a 500 ms delay. Do not parallelize scoped downloads.
- `recent` and `manual` share one discovery pass. `manual` scans the package set
  from that cache: all packages under `-A`, otherwise only recency-filtered
  packages. `external` ignores that cache and enumerates the full org list
  because dormant packages can still have live maintainers.
- Do not hardcode a real org, user, package, or bot account. This is a generic
  tool and those values are user input.

## Tooling Rules

- Use Node 26 and pnpm 11.5.2.
- `pnpm run build` is `vite build`; it transpiles without type-checking.
- `pnpm run typecheck` runs `svelte-check` and is the real Svelte/TypeScript check.
- For automated edits, do not run build, dev, or typecheck unless the user asks.
  The platform validates the build. Use focused checks that match the change and
  report what was not run.
- Prefer `pnpm run format:check`, `pnpm run lint`, `pnpm run test:unit`,
  `pnpm run knip`, and targeted file inspection when they are relevant.
- `pnpm run test` runs unit tests, typecheck, format check, and lint.

## ghostty-web

- `GhosttyTerminal` imports `init`, `Terminal`, and `FitAddon` from
  `ghostty-web` v0.4.0.
- The WASM is inlined as a base64 data URL in the ESM build. `await init()` takes
  no arguments and there is no separate `.wasm` asset to copy.
- The terminal is display-only. It renders the live progress log and never runs a
  shell.
- If WASM initialization fails, `GhosttyTerminal` falls back to a `<pre>` mirror
  so the log is not lost.

## Change Recipes

Adding a report:

1. Add or update shared types in `src/lib/types.ts`.
2. Add the report orchestrator in `src/lib/reports.ts`; accept `FailureLog` and
   `LogFn`.
3. Wire dispatch through `src/lib/runAudit.ts` and `ReportKind`.
4. Add the view in `src/components/`.
5. Add the tab metadata in `src/App.svelte` and, if it belongs in shared snapshots,
   `src/components/ResultsView.svelte`.

Changing audit behavior:

1. Compare the relevant shell-script behavior in `scripts/`.
2. Preserve failure logging and partial-result warnings.
3. Keep data-source choices intentional: fast-npm-meta for discovery,
   per-version manifests for trust, full packuments only where needed.
4. Update README and CONTRIBUTING if user-visible behavior or required workflow
   changes.

Changing persistence:

1. Update `db/schema.ts`.
2. Add a migration under `netlify/database/migrations/`.
3. Update `netlify/functions/reports.ts`.
4. Verify `/report/:id` still renders older stored payloads or document the
   migration boundary.
