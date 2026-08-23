import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import {
  EXAMPLE_ORG,
  EXAMPLE_TOTAL_PACKAGES,
  EXAMPLE_TRUST_HISTORY,
} from "#shared/exampleTrustHistory";

function snapshotValues(): string {
  return EXAMPLE_TRUST_HISTORY.map(
    ({ capturedAt, strong, any }, index) =>
      `(${index}, '${capturedAt}'::timestamp, ${strong}, ${any})`,
  ).join(",\n    ");
}

function snapshotsCte(): string {
  return `
  snapshots (snapshot_index, captured_at, strong_count, any_count) AS (
    VALUES
    ${snapshotValues()}
  ),
  prepared AS (
    SELECT
      snapshot_index,
      captured_at,
      strong_count,
      any_count,
      strong_count / 3 AS staged_publish,
      strong_count - (strong_count / 3) AS trusted_publisher,
      any_count - strong_count AS provenance,
      ${EXAMPLE_TOTAL_PACKAGES} - any_count AS none
    FROM snapshots
  )`;
}

export function buildExampleSeedSql(): string {
  const values = snapshotsCte();
  const reportId = `'dev-example-${EXAMPLE_ORG}-' || to_char(captured_at, 'YYYY-MM-DD')`;
  const latestCapturedAt = EXAMPLE_TRUST_HISTORY.at(-1)!.capturedAt;
  const latestReportId = `dev-example-${EXAMPLE_ORG}-${latestCapturedAt.slice(0, 10)}`;

  return `BEGIN;

WITH${values}
INSERT INTO reports (id, orgs, scope_label, payload, created_at)
SELECT
  ${reportId},
  '${EXAMPLE_ORG}',
  'ALL org packages',
  jsonb_build_object(
    'trust', jsonb_build_object(
      'rows', (
        SELECT jsonb_agg(
          jsonb_build_object(
            'pkg', format('@${EXAMPLE_ORG}/package-%s', lpad(package_number::text, 2, '0')),
            'latestPublish', to_char(
              captured_at - make_interval(days => package_number % 21),
              'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'
            ),
            'version', format('1.%s.%s', snapshot_index, package_number),
            'level', CASE
              WHEN package_number <= staged_publish THEN 'stagedPublish'
              WHEN package_number <= strong_count THEN 'trustedPublisher'
              WHEN package_number <= any_count THEN 'provenance'
              ELSE 'none'
            END,
            'provenance', package_number > strong_count AND package_number <= any_count,
            'trustedPublisher', package_number > staged_publish AND package_number <= strong_count,
            'stagedPublish', package_number <= staged_publish,
            'publisher', CASE
              WHEN package_number <= staged_publish THEN 'release-bot'
              WHEN package_number <= strong_count THEN 'github-actions'
              WHEN package_number <= any_count THEN 'ci'
              ELSE format('maintainer-%s', (package_number % 4) + 1)
            END,
            'deprecated', package_number > ${EXAMPLE_TOTAL_PACKAGES - 3},
            'downloads', 1250000 - package_number * 13000 + ((package_number * 7919) % 997)
          ) ORDER BY package_number
        )
        FROM generate_series(1, ${EXAMPLE_TOTAL_PACKAGES}) AS packages(package_number)
      ),
      'summary', jsonb_build_object(
        'scopeLabel', 'ALL org packages',
        'orgs', jsonb_build_array('${EXAMPLE_ORG}'),
        'total', ${EXAMPLE_TOTAL_PACKAGES},
        'provenance', provenance,
        'trustedPublisher', trusted_publisher,
        'stagedPublish', staged_publish,
        'deprecated', 3,
        'byLevel', jsonb_build_object(
          'stagedPublish', staged_publish,
          'trustedPublisher', trusted_publisher,
          'provenance', provenance,
          'none', none
        )
      )
    ),
    'failures', '[]'::jsonb
  ) || CASE
    WHEN captured_at = '${latestCapturedAt}'::timestamp THEN jsonb_build_object(
      'manual', jsonb_build_object(
        'rows', jsonb_build_array(
          jsonb_build_object(
            'when', '2026-07-18T08:42:10.000Z',
            'who', 'release-admin',
            'ref', '@${EXAMPLE_ORG}/package-41@1.27.41'
          ),
          jsonb_build_object(
            'when', '2026-07-11T16:05:33.000Z',
            'who', 'maintainer-2',
            'ref', '@${EXAMPLE_ORG}/package-58@1.26.58'
          ),
          jsonb_build_object(
            'when', '2026-06-29T13:20:04.000Z',
            'who', 'release-admin',
            'ref', '@${EXAMPLE_ORG}/package-17@1.26.17'
          )
        ),
        'totalScanned', 184,
        'bots', jsonb_build_array('GitHub Actions'),
        'byPublisher', jsonb_build_array(
          jsonb_build_object('who', 'release-admin', 'count', 2),
          jsonb_build_object('who', 'maintainer-2', 'count', 1)
        )
      ),
      'external', jsonb_build_object(
        'rows', jsonb_build_array(
          jsonb_build_object('user', 'former-contractor', 'pkg', '@${EXAMPLE_ORG}/package-52'),
          jsonb_build_object('user', 'former-contractor', 'pkg', '@${EXAMPLE_ORG}/package-59'),
          jsonb_build_object('user', 'community-maintainer', 'pkg', '@${EXAMPLE_ORG}/package-44')
        ),
        'distinctUsers', 2,
        'byUser', jsonb_build_array(
          jsonb_build_object('user', 'former-contractor', 'count', 2),
          jsonb_build_object('user', 'community-maintainer', 'count', 1)
        )
      )
    )
    ELSE '{}'::jsonb
  END,
  captured_at
FROM prepared
ON CONFLICT (id) DO UPDATE SET
  orgs = EXCLUDED.orgs,
  scope_label = EXCLUDED.scope_label,
  payload = EXCLUDED.payload,
  created_at = EXCLUDED.created_at;

WITH${values}
INSERT INTO report_trust_history (
  report_id,
  org_key,
  orgs_json,
  captured_at,
  total,
  staged_publish,
  trusted_publisher,
  provenance,
  none,
  deprecated,
  failure_count
)
SELECT
  ${reportId},
  '${EXAMPLE_ORG}',
  jsonb_build_array('${EXAMPLE_ORG}'),
  captured_at,
  ${EXAMPLE_TOTAL_PACKAGES},
  staged_publish,
  trusted_publisher,
  provenance,
  none,
  3,
  0
FROM prepared
ON CONFLICT (report_id) DO UPDATE SET
  org_key = EXCLUDED.org_key,
  orgs_json = EXCLUDED.orgs_json,
  captured_at = EXCLUDED.captured_at,
  total = EXCLUDED.total,
  staged_publish = EXCLUDED.staged_publish,
  trusted_publisher = EXCLUDED.trusted_publisher,
  provenance = EXCLUDED.provenance,
  none = EXCLUDED.none,
  deprecated = EXCLUDED.deprecated,
  failure_count = EXCLUDED.failure_count;

INSERT INTO report_rerun_schedules (
  org_key,
  orgs_json,
  enabled,
  next_run_at,
  last_run_at,
  last_report_id,
  last_error,
  consecutive_failures,
  updated_at
) VALUES (
  '${EXAMPLE_ORG}',
  jsonb_build_array('${EXAMPLE_ORG}'),
  true,
  now() + interval '1 day',
  '${latestCapturedAt}'::timestamp,
  '${latestReportId}',
  NULL,
  0,
  now()
)
ON CONFLICT (org_key) DO UPDATE SET
  orgs_json = EXCLUDED.orgs_json,
  enabled = EXCLUDED.enabled,
  next_run_at = EXCLUDED.next_run_at,
  last_run_at = EXCLUDED.last_run_at,
  last_report_id = EXCLUDED.last_report_id,
  last_error = EXCLUDED.last_error,
  consecutive_failures = EXCLUDED.consecutive_failures,
  updated_at = EXCLUDED.updated_at;

COMMIT;`;
}

function main(): void {
  const pnpm = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
  const result = spawnSync(
    pnpm,
    ["dlx", "netlify@latest", "database", "connect", "--json", "--query", buildExampleSeedSql()],
    { encoding: "utf8", maxBuffer: 2 * 1024 * 1024 },
  );

  if (result.status !== 0) {
    throw new Error((result.stderr || result.stdout || "Netlify Database seed failed").trim());
  }

  console.log(
    `Seeded ${EXAMPLE_TRUST_HISTORY.length} local ${EXAMPLE_ORG} trust snapshots. ` +
      `Daily tracking is enabled. Open /report/dev-example-${EXAMPLE_ORG}-2026-07-19 ` +
      `or enter "${EXAMPLE_ORG}" in the app.`,
  );
}

const entry = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : "";
if (import.meta.url === entry) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
