# Contributing

This repo is a work-in-progress browser app for npm supply-chain audits. Keep
changes small, behavior-driven, and aligned with the original shell scripts in
`scripts/`.

## Setup

Use Node.js 26+ and pnpm 11.9.0.

```bash
pnpm install
pnpm run dev
```

The dev server runs the Vite app at `http://localhost:5173`. The Netlify Vite
plugin wires local `/api/*` routes for the npm edge proxies, report links, and
daily package-trust tracking API.

## Before Changing Behavior

- Read `AGENTS.md` for the architecture and invariants.
- Treat `scripts/npm-audit.sh` and `scripts/npm-user-publishes.sh` as the
  behavior reference.
- Preserve partial-failure visibility. A failed or rate-limited fetch must be
  recorded and surfaced, not silently treated as a clean or empty result.
- Keep the app generic. Do not hardcode a specific org, user, or package. Bot
  defaults should be broadly applicable automation accounts, not project-specific
  policy.
- Keep npm proxying per-host. Do not create a host-generic proxy.
- Keep scheduled reruns narrow: all-package package trust only, with direct npm
  fetches from the Netlify function runtime.

## Checks

Run the smallest relevant set while developing:

```bash
pnpm run format:check
pnpm run lint
pnpm run typecheck
pnpm run test:unit
pnpm run knip
```

Before opening a PR, run:

```bash
pnpm run test
```

For UI or accessibility changes, keep `a11y.e2e.ts` aligned with the actual UI
and run:

```bash
pnpm exec playwright install --with-deps --only-shell chromium
pnpm run test:a11y
```

For bundle-sensitive changes, use:

```bash
pnpm run build:analyze
```

`pnpm run build` uses Vite and does not type-check; use `pnpm run typecheck` for
Svelte and TypeScript validation.

## Pull Request Checklist

- Behavior changes were checked against the shell-script reference.
- Any new npm fetch path preserves retry/backoff and `FailureLog` semantics.
- Edge proxy changes keep the upstream host hardcoded server-side.
- User-visible behavior is reflected in `README.md`.
- Agent-facing architecture or invariants are reflected in `AGENTS.md`.
- New report types update types, orchestration, views, tabs, exports, and shared
  report rendering as needed.
- Schedule or persistence changes include Drizzle schema updates and a Netlify
  Database migration.
- Relevant checks were run, or skipped checks are explicitly called out with a
  reason.

## Notes For Agents

- Start with `AGENTS.md`, then inspect the files you will actually touch.
- Respect the current worktree. Do not revert unrelated user changes.
- Use `rg` for search and keep edits scoped.
- For automated edits, do not run build, dev, or typecheck unless the user asks;
  report the focused checks you did run.
- If documentation and code disagree, verify against the code and scripts, then
  update the docs rather than preserving stale wording.
