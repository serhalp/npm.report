# Contributing

## Setup

Use Node.js 26+ and pnpm 11.9.0.

```bash
pnpm install
pnpm run dev
```

The dev server runs the Vite app at `http://localhost:5173`. The Netlify Vite plugin emulates the
platform locally, wiring the `/api/*` routes for the audit stream, report links, and daily
package-trust tracking API, hooking up Netlify Database, etc.

To populate the local database with a repeatable 28-day trust history for the fictional `acme`
organization, leave the dev server running and run:

```bash
pnpm run db:seed:local
```

Then enter `acme` in the organization field, open `/report/dev-example-acme-2026-07-19` for that
snapshot, or open `/orgs/acme` for the latest seeded snapshot. Daily tracking is already enabled for
the seeded org, so the shared report shows its tracking status and next scheduled run. The seed uses
Netlify's local database connection and is kept outside
`netlify/database/migrations`, so it is never applied by a deploy.

## Before changing behaviour

- Preserve partial-failure visibility. A failed or rate-limited fetch must be recorded and surfaced,
  not silently treated as a clean or empty result.
- Keep the app broadly usable for most developers. Do not hardcode a specific org, user, or package.
  Bot defaults should be broadly applicable automation accounts, not project-specific policy.
- Keep audits server-side. The browser submits a request and renders the stream; it must not compute
  the audit or POST a report. Fetch npm directly without a CORS proxy. Client-side report generation
  would preclude secure, trustable persisted reports.
- Keep scheduled reruns narrow: all-package package trust only, with direct npm fetches from the
  Netlify function runtime.

## Data privacy and retention

The private org membership list is input to the `external` report (only). The edge function uses it
to identify public package maintainers who are not members, but must not write the raw list to logs,
`audit_jobs.request`, or the saved report payload. Saved reports do include the derived external
findings.

Resumable `audit_jobs` rows contain non-sensitive request metadata, progress logs, and the completed
result. `audit-jobs-cleanup-background.ts` runs hourly and deletes rows once their `created_at` is
more than two hours old. Completed reports are the durable records. If either persistence path
changes, update the user-facing privacy copy and its tests with it.

## Checks

```bash
pnpm run format:check
pnpm run lint
pnpm run typecheck
pnpm run test:unit
pnpm run test:coverage
pnpm run knip
```

`test:coverage` writes a browsable HTML report to `coverage/`. Pull requests also publish the
coverage report in the GitHub Actions job summary; coverage is reported, not enforced.

Before opening a PR, run:

```bash
pnpm run test
```

For UI or accessibility changes, keep `a11y.e2e.ts` aligned with the actual UI and run:

```bash
pnpm exec playwright install --with-deps --only-shell chromium
pnpm run test:a11y
```

For bundle-sensitive changes, use:

```bash
pnpm run build:analyze
```

`pnpm run build` uses Vite and does not type-check; use `pnpm run typecheck` for Svelte and
TypeScript validation.

## Pull Request checklist

- Any new npm fetch path preserves retry/backoff and `FailureLog` semantics.
- Audit request, response, or SSE changes keep `src/shared/schemas.ts`, the edge functions, and the
  client stream wrappers in sync.
- Edge-reachable changes follow the runtime and bundling rules in `AGENTS.md` and pass the
  deploy-time edge build.
- User-visible behaviour is reflected in `README.md`.
- Agent-facing architecture or invariants are reflected in `AGENTS.md`.
- New report types update types, orchestration, dispatch, the request schema, views, tabs, exports,
  and shared report rendering as needed.
- Schedule or persistence changes include a native SQL migration, matching Valibot row-contract
  updates, and coverage using Netlify's local database test package.
