import { getDb } from "#db/index";
import {
  parseRows,
  ReportSocialBaseRowSchema,
  ReportTrustHistoryRowSchema,
  type ReportSocialRow,
} from "#db/schema";

export async function getReportSocialData(id: string): Promise<ReportSocialRow | null> {
  const db = getDb();
  const [row] = parseRows(
    ReportSocialBaseRowSchema,
    await db.sql<unknown>`
      SELECT
        id,
        orgs,
        created_at AS "createdAt",
        CASE
          WHEN payload ? 'trust' THEN jsonb_build_object(
            'total', payload #> '{trust,summary,total}',
            'byLevel', payload #> '{trust,summary,byLevel}'
          )
          ELSE NULL
        END AS trust
      FROM reports
      WHERE id = ${id}
    `,
  );
  if (!row) return null;
  if (!row.trust) return { ...row, history: [] };

  const history = parseRows(
    ReportTrustHistoryRowSchema,
    await db.sql<unknown>`
      SELECT
        report_id AS "reportId",
        org_key AS "orgKey",
        orgs_json AS orgs,
        captured_at AS "capturedAt",
        total,
        staged_publish AS "stagedPublish",
        trusted_publisher AS "trustedPublisher",
        provenance,
        none,
        deprecated,
        failure_count AS "failureCount"
      FROM report_trust_history
      WHERE org_key = (
        SELECT org_key
        FROM report_trust_history
        WHERE report_id = ${id}
      )
      ORDER BY captured_at ASC
      LIMIT 100
    `,
  ).map((point) => ({
    id: point.reportId,
    capturedAt: point.capturedAt,
    total: point.total,
    byLevel: {
      stagedPublish: point.stagedPublish,
      trustedPublisher: point.trustedPublisher,
      provenance: point.provenance,
      none: point.none,
    },
  }));

  return { ...row, history };
}
