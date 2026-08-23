# AGENTS.md

Agents, read [CONTRIBUTING.md](CONTRIBUTING.md) first.

AGENTS.md must not duplicate information. It should only provide agent-specific guidance and improve
progressive disclosure.

## Architecture

Preserve the server-side trust boundary described in `CONTRIBUTING.md`. The
implementation is organized around these entry points:

- `netlify/edge-functions/audit-stream.ts`: `POST /api/audit-stream`; runs and
  persists resumable `trust`/`manual`/`external` audits.
- `netlify/edge-functions/user-publishes-stream.ts`: runs an unpersisted
  user-publish audit at `POST /api/user-publishes-stream`.
- `netlify/functions/reports.ts`: reads saved reports and trust history and
  creates daily schedules. It does not compute or write reports.
- `netlify/functions/trust-reruns-background.ts`: hourly scheduler for due,
  all-package `trust` audits.
- `netlify/functions/audit-jobs-cleanup-background.ts`: removes transient
  `audit_jobs` rows older than two hours.

`src/AppRouter.svelte` owns the `/` and `/report/:id` client routes. Shared
snapshots render through `SharedReport.svelte` and reuse
`components/ResultsView.svelte`.

## Runtime boundaries

The server-side audit graph under `src/lib/` runs in both Deno edge functions
and Node scheduled functions. Anything reachable from `runAudit` or
`runUserPublishes` must use APIs available in both runtimes: no `node:` builtins
and no browser-only globals. Use Web Crypto, not `node:crypto`.

Netlify edge bundling has stricter rules than Vite or local development:

- Edge-reachable relative imports require explicit `.ts` extensions. Node-only
  serverless files use `.js` and must not enter an edge bundle.
- `valibot` and `packumeta` are mapped to pinned esm.sh builds in
  `import_map.json`. A new edge-reachable dependency may need the same treatment.
- `@netlify/database` is Netlify-first-party and deliberately not mapped. Use
  its native tagged-SQL client; validate returned rows with `db/schema.ts`.
- Never put tests in `netlify/edge-functions/`: Netlify treats every `.ts` or
  `.js` file there as an entry point. Put them in
  `netlify/tests/edge-functions/`.

## Audit invariants

### npm access and failure handling

Fetch npm directly through `src/lib/npmClient.ts`:

- `registry.npmjs.org`: packuments and per-version manifests.
- `api.npmjs.org`: weekly downloads.
- `npm.antfu.dev`: use this fast caching proxy whenever possible.

`npmGet` retries network failures, 429s, and 5xx responses. It honors a valid
`Retry-After`; otherwise backoff is 1, 4, 9, and 16 seconds. Exhausted or
unexpected failures enter `FailureLog` and the UI warns that results may be
incomplete. A 404 is legitimately empty.

A failed per-version manifest fetch during a trust check fails the report. It
must not silently classify an unknown package as having no trust signal.

### Discovery and classification

- Trust classification delegates to `packumeta`. Do not reimplement it. Preserve
  its semantics for provenance, trusted publishing, and staged publishing.
- Recency, deprecation, and trust apply to the `latest` dist-tag. Recency is
  `latest.publishedAt`, not the newest timestamp among all versions.
- Discovery has no registry fallback. fast-npm-meta requests contain at most 100
  names joined with `+`; scoped package names retain the literal slash.
- Trust checks fetch lightweight per-version manifests. Only `manual` and user
  publish history fetch full packuments because they need version `_npmUser` data.
- `trust` and `manual` share one discovery pass. `manual` uses every discovered
  package for all-package audits and only recency-filtered packages otherwise.
  `external` enumerates the full org independently because dormant packages can
  still have active maintainers.

### Downloads

Unscoped downloads use the bulk endpoint in batches of 100. Scoped downloads
are sequential with a 500 ms delay; do not parallelize them. A present `null`
value means zero downloads. Only failed or absent fetches remain unknown (`?`).

### Bounds

`auditDefaults.ts` enforces `MAX_ORGS` (5) and `BLOCKED_ORGS` (`types`) at both
the UI and server trust boundary. These are cost and abuse limits.

The Netlify rate limits are part of the abuse boundary: `audit-stream` and `user-publishes-stream`
allow 30 requests/minute per IP; `reports.ts` allows 120. Resumable audits reconnect, so the audit
window must accommodate those extra requests.

## SSE and persistence

Both audit endpoints return `text/event-stream`, one JSON payload per `data:`
line:

- `log`: progress text with a monotonic `id:`.
- `result`: the complete report object.
- `done`: terminal success. `audit-stream` includes the saved report id and URL;
  a save-only failure may return `{ error }` after the usable result.
- `error`: terminal audit failure.

`audit-stream` is resumable because Netlify recycles the client connection after
roughly 60 seconds. The first request for a client-generated `jobId` runs the
audit and records progress, result, and saved report id in `audit_jobs`; it keeps
running after its client disconnects. Requests with the same `jobId` and the
last seen `from` sequence only replay and tail the existing job. Do not replace
this with keepalives or rerun-on-reconnect.

The client implementation is split across:

- `sseStream.ts`: frame reassembly and `id:` parsing.
- `auditStream.ts`: reconnect and resume.
- `userPublishStream.ts`: non-resumable stream consumption.

The stream uses `fetch` and a `ReadableStream`, not `EventSource`: requests are
POSTs, and `external` member lists can exceed URL limits. Request bodies are
validated server-side by `AuditRequestSchema` and `UserPublishRequestSchema` in
`schemas.ts`; validated data is the trust boundary.

Completed `/api/audit-stream` runs are saved server-side. Report ids are
`<orgs>-<yyyy-mm-dd>-<shorthash>`; hashing the payload makes same-day saves
idempotent. There is no public report-write endpoint.

Daily schedules are keyed by normalized org sets and can be created only from a
saved all-package trust report with a `report_trust_history` row. Scheduling is
idempotent: an existing enabled schedule is returned without resetting it. The
privacy and retention contract for saved reports, member input, and transient
jobs lives in `CONTRIBUTING.md` and must remain true when persistence changes.

## UI constraints

Prefer native platform features over custom substitutes: popovers and dialogs,
Clipboard and Web Crypto APIs, `matchMedia`, semantic live regions,
`:focus-visible`, and URL-backed state. Use Baseline widely available features
by default and progressive enhancement for newer ones; do not add JS polyfills
for CSS anchor positioning.

Human-facing dates and times go through `src/lib/dateFormatting.ts` and follow
the viewer's locale and timezone. Persistence, APIs, sorting, report ids,
exports, and `<time datetime>` retain ISO-8601 values. Date-only values are
calendar dates and must not shift across timezones. If visible text omits part
of a timestamp, expose the full localized value in a tooltip.

`LogTerminal` is a display-only, dependency-free progress log. Its visible log
is the screen-reader live region (`role="log"`, `aria-live="polite"`). Do not
introduce a shell, terminal emulator, WASM runtime, or a CSP need for
`'wasm-unsafe-eval'`.

## Agent editing rules

- For automated edits, do not run build, dev, or typecheck unless the user asks;
  use focused checks and report what was not run.
- Preserve unrelated user changes and existing staging boundaries.
- Comments should explain enduring constraints or non-obvious current behavior.
  Do not narrate previous implementations, intermediary states, or the edit that
  introduced the code.
