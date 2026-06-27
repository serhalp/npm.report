# npm org trust & access audit

A browser-based supply-chain audit tool for npm organizations. Point it at any
npm org(s) and it answers three questions:

1. **Trusted-publishing / provenance rollout** — the supply-chain trust status of
   every package's latest release.
2. **Manual publishes** — versions published from a human account rather than CI.
3. **External maintainers** — npm users who can publish *now* but aren't org
   members (stale publish access = attack surface).

It is a TypeScript port of two bash scripts (`scripts/npm-audit.sh`,
`scripts/npm-user-publishes.sh`), kept in the repo as the reference
specification. The audit runs **entirely in the browser** against the public npm
registry — no backend, no data leaves the page.

## Why client-side (and no shell execution)

[`coder/ghostty-web`](https://github.com/coder/ghostty-web) is a terminal
*renderer* (Ghostty's VT100 parser compiled to WASM, a drop-in for xterm.js) —
it does not execute shells. And the audit is a multi-minute job that fetches
hundreds of packages, which doesn't fit a serverless function's timeout or its
6 MB response cap (one packument is 23 MB).

The unlock: all three upstream APIs
(`registry.npmjs.org`, `api.npmjs.org`, `npm.antfu.dev`) send
`Access-Control-Allow-Origin: *`, so the browser can call them directly. The
shell logic is ported to TypeScript and run client-side; `ghostty-web` displays
the live progress log. The result is a pure static site with zero server code.

## Reports

| Report | What it shows | Notes |
| --- | --- | --- |
| `recent` | Trust level of each package's `latest` release | Trust logic ported verbatim from [packumeta](https://github.com/43081j/packumeta): staged publish > trusted publisher (OIDC + provenance) > provenance > none |
| `manual` | Who published manually (non-bot) in the window | "Manual" is a proxy — npm can't distinguish a human from their CI token |
| `external` | Maintainers with live publish rights who aren't org members | Requires pasted `npm org ls <org> --json` output (membership isn't public) |
| user-publishes | Versions a specific npm user personally published | Standalone tool, scans the user's own packages + optionally the last audit's set |

Each report renders as a **sortable table** with **Copy JSON** and **Download
CSV**.

## Tech

- **Vite + React + TypeScript** — static SPA, no server.
- **ghostty-web** — live audit log terminal (WASM inlined in the ESM build, so
  no asset wiring needed).
- No data persistence: every run is ephemeral and stays in the browser.

## Run locally

```bash
npm install
npm run dev      # http://localhost:5173
```

Build for production:

```bash
npm run build    # -> dist/
npm run preview
```

Deployment is configured in `netlify.toml` (static publish of `dist/` with an
SPA fallback redirect).

## Using the external report

npm org membership is not exposed by any unauthenticated API. For the `external`
report the app gives you a `npm org ls <org> --json` command per org to run
locally (you must be logged in / authorized for the org), then you paste the
JSON output back. Membership goes stale as people join and leave — refresh it
each run.

## Known limitations (inherited from the registry, not bugs)

- `registry.npmjs.org/-/org/<org>/package` **hard-caps at 250 packages** and
  ignores pagination. Larger orgs lose the alphabetical tail; those packages are
  private/unlisted and unreachable unauthenticated anyway.
- The `api.npmjs.org` downloads endpoint is a strict token bucket; scoped-package
  download counts are fetched sequentially and paced, so a large run takes a
  while.
- Failed fetches are retried with backoff and **counted** — a rate-limited
  package is reported as incomplete rather than silently treated as "clean."
