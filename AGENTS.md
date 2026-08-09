# AGENTS.md

Architecture and rules for agents editing this project.

## Project Shape

This is a web app for npm supply-chain audits. It is a TypeScript port of two
shell scripts in `scripts/`; those scripts are the reference specification for
audit behavior. When changing audit semantics, diff against the scripts and
preserve their documented behavior unless the user explicitly asks otherwise.

Audits run server-side and stream to the browser. When the user runs an audit
the browser POSTs a validated request to a Netlify **edge function**, which runs
the audit and streams progress and the final result back over SSE (see the SSE
Contract below). The browser is a thin client: it submits the request, renders
the streamed `log` lines in the terminal, and renders the streamed `result` in
the tables. It does not orchestrate discovery, trust, downloads, or maintainer
checks itself.

This is deliberate. Because the server computes the report, the report is
authoritative by construction — the browser never submits trust data — and there
is no CORS-proxy/SSRF surface to maintain. Do not move audit computation back
into the browser, and do not add a browser-submitted report-write path.

The audit library (`src/lib/*`) therefore runs in BOTH the browser (bundled by
Vite) and the Deno edge runtime. Keep it free of `node:` builtins and
browser-only globals: hashing uses Web Crypto (`crypto.subtle`), not
`node:crypto`.

The server-side entry points are:

- `netlify/edge-functions/audit-stream.ts` — `POST /api/audit-stream`. Runs
  `runAudit` for the `trust`/`manual`/`external` kinds, streams `log`/`result`,
  saves the completed report server-side, and streams a final `done` with the
  saved report id. This is the trust boundary. The run is a resumable durable job
  (keyed by a client `jobId`; see the SSE Contract) so it survives the platform's
  ~60s connection recycle — the first request runs the audit, reconnects tail it.
- `netlify/edge-functions/user-publishes-stream.ts` —
  `POST /api/user-publishes-stream`. Runs `runUserPublishes` and streams
  `log`/`result`. It does not persist anything.
- `netlify/functions/trust-reruns-background.ts` — an hourly scheduled background
  function. It reruns the all-package `recent`/package-trust report for opted-in
  org sets so the public timeline can grow without a browser session. It must not
  run, derive, store, or query `manual` or `external` report data.
- `netlify/functions/audit-jobs-cleanup-background.ts` — an hourly scheduled
  background function that prunes `audit_jobs` rows older than 2h (the resumable
  audit's transient progress store; the durable report lives in `reports`).
- `netlify/functions/reports.ts` — a serverless function for reading stored
  reports and the public trust timeline, and for creating daily tracking
  schedules, through Netlify Database. It does not compute audits and has no
  report-write endpoint.

## npm Access

npm is fetched directly from the server. Because audits run in edge/background
functions, not the browser, there is no cross-origin restriction to work around,
so the CORS proxies (and their shared proxy core) were removed. There is no
host-generic proxy and no request-controlled upstream host — i.e. no SSRF
surface to defend.

`src/lib/npmClient.ts` (`npmGet`/`npmGetJson`) fetches the upstream hosts
directly, with the retry/backoff/`FailureLog` semantics under Invariants:

- `registry.npmjs.org` — packuments and per-version manifests.
- `api.npmjs.org` — weekly download counts.
- `npm.antfu.dev` (fast-npm-meta) — batched discovery metadata.

When adding a new npm upstream, add the URL helper in `npmClient.ts` and fetch
it directly; do not reintroduce a proxy layer.

## Edge Bundling (Deno)

The edge functions run on Deno, and Netlify's npm-in-edge bundling is still beta:
it fails to load some clean-ESM third-party packages the audit graph pulls in
(currently `valibot` and `packumeta`). Those are mapped to esm.sh in
`import_map.json`, wired via `deno_import_map` in `netlify.toml`, so the edge
bundler resolves Deno-compatible builds at deploy time. The Vite browser build
and vitest ignore the import map and keep resolving the same bare specifiers from
`node_modules`, so nothing changes for the client.

- Relative imports in any file reachable from an edge function MUST carry an
  explicit `.ts` extension. Deno resolves the literal specifier — it does not add
  extensions or map `.js` -> `.ts` — so extensionless or `.js` relative imports
  bundle fine in Vite/vitest/Node but fail the edge bundler. That is why
  `src/lib/*` and the edge-reachable `_shared`/`db` imports use `.ts`
  (`tsconfig` enables `allowImportingTsExtensions`). Node-only files (e.g.
  `report-schedules.ts` and the serverless functions) keep `.js`; they never enter
  an edge bundle.
- This failure only surfaces at deploy-time edge bundling, NOT in local dev — the
  `@netlify/vite-plugin` bundles the edge functions differently and resolves npm
  deps and extensionless imports fine. Do not assume a green local run means the
  edge bundle is deployable; verify with `pnpm dlx netlify-cli build` (aka
  `netlify build`), which runs the real edge bundler.
- Any NEW third-party npm dependency reachable from `runAudit` /
  `runUserPublishes` (i.e. bundled into an edge function) may need an
  `import_map.json` entry. Keep the pinned esm.sh versions in sync with
  `package.json`.
- The `drizzle-orm` / `@netlify/database` stack is deliberately NOT mapped: they
  are Netlify-first-party (resolved natively) and drizzle is pinned to a
  git-snapshot version esm.sh can't build.

## SSE Contract

Both audit endpoints stream `text/event-stream`, one JSON payload per `data:`
line, with these events:

- `log` — a progress line (string), carrying an `id:` (a monotonic sequence
  number) so a reconnecting client can resume after the last line it saw. The
  browser appends it to the terminal.
- `result` — the full report object.
- `done` — terminal success. For `audit-stream`, `{ id, url }` of the saved
  report (or `{ error }` if only the save failed — the result still streamed).
  For `user-publishes-stream`, `{}` (nothing is persisted).
- `error` — terminal failure (string): the audit itself failed.

`audit-stream` is **resumable**. The client-facing connection is recycled by the
platform (~60s), far shorter than a scope-heavy audit, so one connection can't
carry the whole run and no keepalive beats a total cut. Each run is instead a
durable job keyed by a client-generated `jobId` (the `audit_jobs` table and
`netlify/functions/_shared/audit-jobs.ts`): the FIRST request runs the audit,
persisting its progress log — and, on completion, the result and saved report id
— and keeps running even if its own client disconnects. A reconnecting request
(same `jobId`, `from` = last `log` id it saw) does NOT re-run; it replays stored
lines after `from`, tails the job until it finishes, and forwards the result/link
(or error) the run recorded. `streamAudit` drives this loop transparently, so the
terminal keeps scrolling and reports stay complete however long the audit runs.
This is the platform-intended SSE pattern — reconnect + resume, as Netlify's own
EventSource examples rely on — implemented over POST because the request body
(esp. `external` member lists) can exceed URL limits. `user-publishes-stream` is
not resumable and persists nothing.

Client readers live in `src/lib/sseStream.ts` (`readSseStream`, which reassembles
frames across chunks and parses the `id:`), with `src/lib/auditStream.ts`
(`streamAudit`, which reconnects/resumes) and `src/lib/userPublishStream.ts`
(`streamUserPublishes`) wrapping the two endpoints. Request bodies are validated
server-side with valibot (`AuditRequestSchema`, `UserPublishRequestSchema` in
`src/lib/schemas.ts`); the validated request is the trust boundary.

## Report Sharing

Report links are stateful, and the server owns the write. As part of a completed
`/api/audit-stream` run, `audit-stream.ts` calls `saveReportSnapshot` to store
the `AuditResult` plus completed-run context (`orgs`, `scope`, `scopeLabel`,
`capturedAt`) in Netlify Database, then streams the saved id in the `done` event.
The id has the form `<orgs>-<yyyy-mm-dd>-<shorthash>`; the hash is derived from
the payload, so saving the same report on the same day is idempotent. There is
no browser-facing report-write endpoint — the browser never POSTs a report.

`GET /api/reports/:id` returns the stored row. The UI share action only copies
the already-created report link.

Daily tracking is created with `POST /api/reports/:id/schedule-daily`. The
endpoint is eligible only when the saved report already has a
`report_trust_history` row, which means it came from an all-scope package trust
report. Schedules are keyed by the same normalized org set as the timeline.

The client detects `/report/:id` in `src/main.ts`, renders
`src/SharedReport.svelte`, and reuses `components/ResultsView.svelte` for the
read-only snapshot.

Reads and schedule writes are small JSON, so `reports.ts` stays a serverless
function. Only the audit stream needs an edge function: SSE streaming with no
serverless timeout and no response-size cap on large packument-derived results.

## Platform-first UI

Prefer native web-platform features over hand-rolled equivalents — reinventing
them is how avoidable accessibility and behavior bugs creep in. Reach for the
platform first: `popover` / `<dialog>` for overlays (the trust glossary is
`popover="auto"` + CSS anchor positioning), `navigator.clipboard` for copy,
`crypto.subtle` / `crypto.randomUUID` for hashing and ids, `matchMedia` +
`prefers-color-scheme` for theming, `scrollIntoView` / `:focus-visible` /
`role="status"|"alert"` live regions for focus, scroll, and announcements, and
the URL hash for view state. Target Baseline — _widely available_ by default,
_newly available_ when it earns its keep (as `popover` does) — and enhance
progressively: e.g. CSS anchor positioning behind `@supports` with a fixed
fallback, never a JS polyfill.

Two deliberate exceptions exist so they don't get "fixed":

- The audit stream reads a `fetch` `ReadableStream`, not `EventSource` — the
  request body (esp. `external` member lists) can exceed URL limits and
  `EventSource` is GET-only. See the SSE Contract.
- Timestamps render as stable ISO-ish strings (`toISOString().slice(…)`,
  `fmtDate`) rather than `Intl.DateTimeFormat`, so a report reads the same for
  every viewer regardless of locale.

## Layout

```text
index.html              Vite entry; loads IBM Plex fonts
netlify.toml            Netlify static publish of dist/, SPA redirect, security headers, edge import map
import_map.json         Deno import map: edge-only npm deps (valibot, packumeta) -> esm.sh
scripts/                Original shell scripts; behavior reference, not executed
db/                     Drizzle schema and Netlify Database connection
netlify/
  edge-functions/
    audit-stream.ts             POST /api/audit-stream: run resumable audit, stream SSE, save report
    user-publishes-stream.ts    POST /api/user-publishes-stream: run user history, stream SSE
  functions/
    reports.ts                  Serverless: read stored reports + trust timeline, create schedules
    trust-reruns-background.ts  Hourly background rerun of due daily package-trust schedules
    audit-jobs-cleanup-background.ts  Hourly prune of transient audit_jobs (resumable-audit) rows
    _shared/                    Shared report persistence, schedule, and audit-job helpers
src/
  main.ts               Svelte root and tiny /report/:id path switch
  App.svelte            Live audit UI; submits audits to the server, renders streamed progress + result
  SharedReport.svelte   Read-only shared report route
  styles.css            Design system and app styling
  lib/
    types.ts            Shared types; field names mirror script TSV columns
    schemas.ts          valibot schemas for serialization boundaries (SSE requests, stored reports)
    auditDefaults.ts    Shared fetch concurrency and generic bot defaults
    npmClient.ts        npmGet/npmGetJson (direct npm fetch), retry/backoff, FailureLog, URL helpers
    sseStream.ts        readSseStream: SSE frame reassembly + id parsing across chunks
    auditStream.ts      streamAudit: POST /api/audit-stream, reconnect/resume, consume the stream
    userPublishStream.ts streamUserPublishes: POST /api/user-publishes-stream and consume the stream
    concurrency.ts      pLimit, mapLimit, chunk
    trust.ts            Thin adapter around packumeta trust logic
    discovery.ts        Org listing and fast-npm-meta batch resolve
    downloads.ts        Weekly downloads, including paced scoped lookups
    members.ts          Parse npm org ls JSON or a plain member list
    reports.ts          Audit orchestration (trust/manual/external/user-publishes)
    runAudit.ts         Top-level audit dispatch
    reportHistory.ts    Org normalization, scope labels, trust-history extraction
    export.ts           Copy JSON and CSV download helpers
  components/
    LogTerminal.svelte     Display-only progress log of streamed audit output
    DataTable.svelte       Generic sortable table
    TagInput.svelte        Chip multi-value input
    ExportButtons.svelte   Per-report export controls
    TrustView.svelte       Package trust level report view (`trust` internally)
    ManualView.svelte      Manual report view
    ExternalView.svelte    External report view
    UserPublishView.svelte User publish-history view
    ResultsView.svelte     Shared tabbed report renderer
```

## Invariants

- No silent failure. `npmGet` retries 429, 5xx, and network failures. It honors a
  valid `Retry-After` header, otherwise uses 1, 4, 9, and 16 second backoff.
  Exhausted or unexpected failures go into `FailureLog`; the UI warns that
  results may be incomplete. 404 is treated as legitimately empty. One case is
  escalated past a warning: a per-version manifest that can't be fetched during a
  `trust` trust check throws and fails the whole report, because a missing
  manifest would misclassify the package as trust "none" rather than "unknown".
- Trust classification in `src/lib/trust.ts` delegates to `packumeta`; do not
  reimplement that logic locally. The adapter only adds fields the app needs for
  reports (`level`, numeric `order`, and `publisher`). Follow `packumeta`'s
  JavaScript truthiness semantics for provenance, trusted publisher, and staged
  publish.
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
  with a 500 ms delay. Do not parallelize scoped downloads. A present-but-null
  entry is a real 0; only a failed/absent fetch stays unknown ("?").
- `trust` and `manual` share one discovery pass. `manual` scans the package set
  from that cache: all packages under `-A`, otherwise only recency-filtered
  packages. `external` ignores that cache and enumerates the full org list
  because dormant packages can still have live maintainers.
- Do not hardcode a real org, user, or package. This is a generic tool and those
  values are user input. Generic automation-account defaults are allowed only
  when they are broadly applicable, such as the current `GitHub Actions` manual
  exclusion default. Two bounded exceptions live in `auditDefaults.ts` and are
  enforced on both the browser and the server trust boundary: `MAX_ORGS` (5) caps
  orgs per audit, and `BLOCKED_ORGS` (currently `types`) denylists orgs too large
  to audit within platform limits. These bound cost/abuse — they are not defaults
  that audit a specific org.
- The audit library runs in both the browser bundle and the Deno edge runtime.
  Nothing reachable from `runAudit`/`runUserPublishes` in `src/lib/*` may use
  `node:` builtins or browser-only globals; hashing uses Web Crypto.
- Reports are authoritative because the server computes them. `audit-stream.ts`
  owns the save; there is no browser-submitted report-write path, and the daily
  background rerun writes only `recent`/package-trust data.
- The interactive audit is a resumable durable job. The client-facing SSE
  connection is recycled (~60s), so `audit-stream` persists progress to the
  `audit_jobs` table keyed by a client `jobId`, and the client reconnects to
  resume — the first request runs the audit (and finishes it even if the client
  disconnects, so the report still saves); a reconnect only tails. Rows are
  throwaway (the durable report is in `reports`) and pruned hourly by
  `audit-jobs-cleanup-background.ts`. Do not reintroduce a keepalive: it cannot
  beat a total connection cut — reconnect + resume is the fix.
- The report-creation endpoints are rate-limited per IP at the Netlify edge (the
  `rateLimit` field in each function's `config`): `audit-stream` and
  `user-publishes-stream` at 30/min, `reports.ts` at 120/min. This is the abuse
  bound chosen in lieu of authenticating the endpoints; keep it when editing them.
  A long audit reconnects a few times, each re-hitting `audit-stream`, so keep the
  window above those extra requests.
- `schedule-daily` is idempotent: an already-enabled schedule for the same
  normalized org set is returned unchanged, not reset.

## Tooling Rules

- Use Node 26 and pnpm 11.9.0.
- `pnpm run build` is `vite build`; it transpiles without type-checking.
- `pnpm run typecheck` runs `svelte-check` and is the real Svelte/TypeScript check.
- For automated edits, do not run build, dev, or typecheck unless the user asks.
  The platform validates the build. Use focused checks that match the change and
  report what was not run.
- Prefer `pnpm run format:check`, `pnpm run lint`, `pnpm run test:unit`,
  `pnpm run knip`, and targeted file inspection when they are relevant.
- `pnpm run test` runs unit tests, typecheck, format check, and lint.

## Progress Log

- `LogTerminal` renders the streamed audit progress (the SSE `log` events) as a
  plain, scrolling, display-only log. It exposes `writeLine(line)` / `clear()`,
  which `App.svelte` binds and calls as the stream arrives.
- No runtime dependency, no shell. The visible log is itself the screen-reader
  live region (`role="log"`, `aria-live="polite"`), so progress and the "results
  may be INCOMPLETE" warning are announced.
- It replaced a `ghostty-web` WASM terminal that inlined ~413 KB of base64 WASM
  into the browser bundle (~85% of it) to render append-only text. Do not
  reintroduce a WASM terminal for a display-only log; removing it also let the CSP
  drop `'wasm-unsafe-eval'`.

## Change Recipes

Adding a report:

1. Add or update shared types in `src/lib/types.ts`.
2. Add the report orchestrator in `src/lib/reports.ts`; accept `FailureLog` and
   `LogFn`.
3. Wire dispatch through `src/lib/runAudit.ts` and `ReportKind`.
4. Allow the kind server-side: add it to the `kinds` picklist in
   `AuditRequestSchema` (`src/lib/schemas.ts`), or the edge function rejects the
   request before the audit runs.
5. Add the view in `src/components/`.
6. Add the tab metadata in `src/App.svelte` and, if it belongs in shared
   snapshots, `src/components/ResultsView.svelte`.

Changing audit behavior:

1. Compare the relevant shell-script behavior in `scripts/`.
2. Preserve failure logging and partial-result warnings.
3. Keep data-source choices intentional: fast-npm-meta for discovery,
   per-version manifests for trust, full packuments only where needed.
4. Update README and CONTRIBUTING if user-visible behavior or required workflow
   changes.

Changing the audit request or SSE contract:

1. Update the valibot schema in `src/lib/schemas.ts`. The server validates the
   request; the validated request is the trust boundary.
2. Update the matching edge function in `netlify/edge-functions/` and the client
   wrapper (`auditStream.ts` / `userPublishStream.ts`).
3. Keep the event names (`log`/`result`/`done`/`error`) in sync on both sides.

Changing persistence:

1. Update `db/schema.ts`.
2. Add a migration under `netlify/database/migrations/`.
3. Update shared persistence/schedule helpers under `netlify/functions/_shared/`
   and any public API in `netlify/functions/reports.ts`.
4. Verify `/report/:id` still renders older stored payloads or document the
   migration boundary.
