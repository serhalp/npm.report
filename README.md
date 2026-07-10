# npm supply-chain audit

A browser app for auditing public npm organization packages for supply-chain
trust and live publish access.

It answers:

- Package trust level: trust status of each in-scope package's `latest` release.
- `manual`: versions published by non-bot accounts in the selected window.
- `external`: current package maintainers who are not listed as org members.
- User publish history: versions a specific npm user personally published.

The TypeScript audit logic is a port of the original shell scripts in
`scripts/`. Those scripts are kept as the behavior reference.

## Run Locally

Requirements:

- Node.js 26+
- pnpm 11.9.0

```bash
pnpm install
pnpm run dev
```

Open `http://localhost:5173`.

Build and preview production output:

```bash
pnpm run build
pnpm run preview
```

`pnpm run build` transpiles with Vite; it does not type-check. Use
`pnpm run typecheck` when you need TypeScript validation.

## Use The App

1. Enter up to five npm org slugs.
2. By default, the audit scans all org packages. Select "Limit to recent packages" to use a
   recency window.
3. Select package trust level, `manual`, `external`, or any combination. Package trust
   level and `manual` are selected by default.
4. For `manual`, adjust bot or CI publisher account names to exclude. The
   default exclusion list starts with `GitHub Actions`.
5. For `external`, run `npm org ls <org> --json` locally while authenticated and
   paste the output. npm package maintainers are public, but org membership is
   private, so the app needs your authenticated member list to compare them.
6. Run the audit. Results render as sortable tables with JSON copy and CSV
   download actions.
7. The server saves each completed run automatically; copy its report link to
   share the read-only snapshot.
8. For all-package package trust reports, select "Track daily" to append one
   automatic trust snapshot per day.

## Architecture

- Vite, Svelte 5, and TypeScript provide the static client. It submits audits to
  the server and renders the streamed progress and results.
- Audits run server-side in Netlify edge functions and stream to the browser
  over SSE (`POST /api/audit-stream` and `POST /api/user-publishes-stream`). The
  browser does not compute the audit; because the server does, the saved report
  is authoritative.
- npm is fetched directly from the server (`registry.npmjs.org`,
  `api.npmjs.org`, and `npm.antfu.dev`). There are no CORS proxies — the earlier
  browser-side proxies were removed.
- Daily tracking reruns the all-package package trust report for opted-in org
  sets from an hourly Netlify scheduled background function.
- Report links and daily tracking are the only stateful features. The audit
  stream saves the completed `AuditResult` plus display metadata to Netlify
  Database as part of the run; `/report/:id` renders that snapshot read-only.
  There is no browser-facing report-write endpoint.

## Important Limits

- npm's public org package endpoint caps results at 250 packages per org.
- `external` needs fresh pasted membership output because org membership is
  private and can change.
- "Manual" means the version's `_npmUser` was not in the configured bot list;
  npm does not distinguish a human login from that account's automation token.
- Trust labels are delegated to `packumeta`.
- Scoped package download counts are intentionally fetched sequentially with a
  500 ms delay because `api.npmjs.org` rate-limits aggressively.
- Failed or exhausted fetches are counted and surfaced. A rate-limited package
  must not silently look clean.

## Development Checks

Useful commands:

```bash
pnpm run format:check
pnpm run lint
pnpm run typecheck
pnpm run test:unit
pnpm run knip
pnpm run test:a11y
pnpm run test
```

See `CONTRIBUTING.md` for contribution workflow and `AGENTS.md` for agent-facing
architecture rules.
