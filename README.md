# npm.report

**npm.report** is a supply-chain trust multi-tool for npm orgs. For a given org or orgs, it looks up
trust signals on each package's latest release (none, provenance, trusted publishing, staged
publishing), all versions published manually, and all maintainers of org packages who aren't org
members. Reports are shareable and exportable and can be set to automatically update daily in order
to track progress and trends over time.

> Not affiliated with or endorsed by npm, Inc. This is a free, open-source project for the
> community.

<img width="1490" height="1172" alt="Screenshot 2026-08-23 at 10 14 13" src="https://github.com/user-attachments/assets/4a17e72e-52c2-402f-aba9-82fe9442749e" />

<img width="1455" height="877" alt="Screenshot 2026-08-23 at 10 17 02" src="https://github.com/user-attachments/assets/f87c25c3-d167-442b-9868-08e65db89162" />

More specifically, it offers four report types:

1. Package trust level: trust status of each in-scope package's `latest` release.
2. `manual`: versions published by non-bot accounts in the selected window.
3. `external`: current package maintainers who are not listed as org members.
4. User publish history: versions a specific npm user personally published.

## What problem does this solve?

Users and organizations should use modern, secure npm publishing mechanisms. They may have many
(perhaps hundreds) of packages to audit, prioritize, and keep tabs on. Although the necessary
information exists, there is no official tooling that makes this easy. npm.report attempts to fill that gap.

## How to use

1. Enter up to 5 npm orgs.
2. By default, the audit scans all org packages. Select "Limit to recent packages" to use a recency
   window if needed.
3. Select reports: `package trust level`, `manual`, `external`, or any combination. Package trust
   level and `manual` are selected by default.
4. For `manual`, adjust bot or CI publisher account names to exclude. The default exclusion list
   starts with `GitHub Actions`. (Please feel free to submit a PR to add more known bot identifiers.)
5. For `external`, run `npm org ls <org> --json` locally while authenticated and paste the output.
   npm package maintainers are public, but org membership is private, so the app needs your
   authenticated member list to compare them. The list is used only for that audit and is not
   persisted; derived external findings are included in the saved report.
6. Run the audit. Results render as sortable tables with JSON copy and CSV download actions.
7. The server saves each completed run automatically. `/report/:id` preserves that exact snapshot;
   eligible package-trust reports also link to `/orgs/:orgs`, which always shows the latest snapshot
   for the normalized org set.
8. For all-package package trust reports, select "Track daily" to generate one automatic trust
   snapshot per day. You'll be able to visualize progress and trends over time.

## Architecture

- Vite, Svelte 5, and TypeScript provide the static client. It submits audits to the server and
  renders the streamed progress and results.
- Audits run server-side in Netlify edge functions and stream to the browser over SSE (`POST
/api/audit-stream` and `POST /api/user-publishes-stream`). The browser does not compute the audit;
  because the server does, the saved report is authoritative.
- npm is fetched directly from the server (`registry.npmjs.org`, `api.npmjs.org`, and
  `npm.antfu.dev`).
- Daily tracking reruns the all-package package trust report for opted-in org sets from an hourly
  Netlify scheduled background function that picks up daily work that is due.
- Report links and daily tracking are the only durable stateful features. The audit stream saves the
  completed `AuditResult` plus display metadata to Netlify Database as part of the run; `/report/:id`
  renders that snapshot read-only, while `/orgs/:orgs` resolves the latest all-package trust snapshot
  without changing the stable URL.
- Resumable audit jobs retain non-sensitive request metadata, progress, and results temporarily;
  hourly cleanup removes job records after they are two hours old. Private org membership input is
  not written to the job or report records.

## Limitations

- `external` needs manually pasted membership output because org membership is private and can
  change.
- "Manual" means the version's `_npmUser` was not in the configured bot list; npm does not
  distinguish a human login from any of that account's automation tokens.
- Scoped package download counts are intentionally fetched sequentially with a 500 ms delay because
  `api.npmjs.org` rate-limits aggressively.

## Development

See `CONTRIBUTING.md` to run this app locally and contribute. See `AGENTS.md` for agent-optimized
guidance.
