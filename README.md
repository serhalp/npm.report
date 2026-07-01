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

1. Enter one or more npm org slugs.
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
7. Copy the automatically saved report link when you want to share the read-only snapshot.
8. For all-package package trust reports, select "Track daily" to append one
   automatic trust snapshot per day.

## Architecture

- Vite, Svelte 5, and TypeScript provide a static client-side app.
- Audit orchestration runs in the browser for interactive reports.
- Daily tracking is the narrow server-side exception: an hourly Netlify
  scheduled background function reruns only the all-package package trust report
  for opted-in org sets.
- npm fetches go through thin Netlify edge proxies:
  - `/api/npm-registry/*` -> `registry.npmjs.org`
  - `/api/npm-downloads/*` -> `api.npmjs.org`
  - `/api/npm-meta/*` -> `npm.antfu.dev`
- Each proxy pins one upstream host server-side, streams the upstream response,
  adds CORS, and applies a 5-minute shared cache for successful responses.
- Report links and daily tracking are the only stateful features. `POST
/api/reports` stores a completed `AuditResult` plus display metadata in
  Netlify Database after each successful run; `/report/:id` renders that
  snapshot read-only.

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
