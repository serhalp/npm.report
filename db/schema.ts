import * as v from "valibot";

// Runtime contracts for rows returned by native Netlify Database queries.
// SQL migrations remain the database schema source of truth; these schemas make
// the application boundary explicit and infer the corresponding TypeScript
// types without asserting that unchecked query results have a particular shape.

export const ReportRowSchema = v.object({
  id: v.string(),
  orgs: v.string(),
  scopeLabel: v.string(),
  payload: v.unknown(),
  createdAt: v.nullable(v.date()),
});
export type ReportRow = v.InferOutput<typeof ReportRowSchema>;

const ReportSocialCountSchema = v.pipe(v.number(), v.integer(), v.minValue(0));
const ReportSocialByLevelSchema = v.object({
  stagedPublish: ReportSocialCountSchema,
  trustedPublisher: ReportSocialCountSchema,
  provenance: ReportSocialCountSchema,
  none: ReportSocialCountSchema,
});
const ReportSocialTrustSchema = v.object({
  total: ReportSocialCountSchema,
  byLevel: ReportSocialByLevelSchema,
});
const reportSocialFields = {
  id: v.string(),
  orgs: v.string(),
  createdAt: v.nullable(v.date()),
  trust: v.nullable(ReportSocialTrustSchema),
};

export const ReportSocialBaseRowSchema = v.object(reportSocialFields);
export type ReportSocialBaseRow = v.InferOutput<typeof ReportSocialBaseRowSchema>;

export const ReportSocialRowSchema = v.object({
  ...reportSocialFields,
  history: v.array(
    v.object({
      id: v.string(),
      capturedAt: v.date(),
      total: ReportSocialCountSchema,
      byLevel: ReportSocialByLevelSchema,
    }),
  ),
});
export type ReportSocialRow = v.InferOutput<typeof ReportSocialRowSchema>;

// Schedule state is joined at read time rather than stored on the report row.
export const SharedReportRowSchema = v.object({
  id: v.string(),
  orgs: v.string(),
  scopeLabel: v.string(),
  payload: v.unknown(),
  createdAt: v.nullable(v.date()),
  dailyTrackingEnabled: v.boolean(),
  dailyTrackingNextRunAt: v.nullable(v.date()),
});
export type SharedReportRow = v.InferOutput<typeof SharedReportRowSchema>;

export const ReportTrustHistoryRowSchema = v.object({
  reportId: v.string(),
  orgKey: v.string(),
  orgs: v.array(v.string()),
  capturedAt: v.date(),
  total: v.number(),
  stagedPublish: v.number(),
  trustedPublisher: v.number(),
  provenance: v.number(),
  none: v.number(),
  deprecated: v.number(),
  failureCount: v.number(),
});
export type ReportTrustHistoryRow = v.InferOutput<typeof ReportTrustHistoryRowSchema>;

export const TrackedOrgSetRowSchema = v.object({
  reportId: v.string(),
  orgKey: v.string(),
  orgs: v.array(v.string()),
  capturedAt: v.date(),
  total: v.number(),
  stagedPublish: v.number(),
  trustedPublisher: v.number(),
  provenance: v.number(),
  none: v.number(),
  deprecated: v.number(),
  failureCount: v.number(),
  nextRunAt: v.date(),
});
export type TrackedOrgSetRow = v.InferOutput<typeof TrackedOrgSetRowSchema>;

export const ReportRerunScheduleRowSchema = v.object({
  orgKey: v.string(),
  orgs: v.array(v.string()),
  enabled: v.boolean(),
  nextRunAt: v.date(),
  lastRunAt: v.nullable(v.date()),
  lastReportId: v.nullable(v.string()),
  lastError: v.nullable(v.string()),
  consecutiveFailures: v.number(),
});
export type ReportRerunScheduleRow = v.InferOutput<typeof ReportRerunScheduleRowSchema>;

export const AuditJobStatusSchema = v.picklist(["running", "done", "error"]);
export type AuditJobStatus = v.InferOutput<typeof AuditJobStatusSchema>;

export const AuditJobLineSchema = v.object({
  seq: v.number(),
  line: v.string(),
});
export type AuditJobLine = v.InferOutput<typeof AuditJobLineSchema>;

export const AuditJobRowSchema = v.object({
  id: v.string(),
  request: v.unknown(),
  log: v.array(AuditJobLineSchema),
  status: AuditJobStatusSchema,
  result: v.nullable(v.unknown()),
  reportId: v.nullable(v.string()),
  error: v.nullable(v.string()),
  createdAt: v.date(),
  updatedAt: v.date(),
});
export type AuditJobRow = v.InferOutput<typeof AuditJobRowSchema>;

export const IdRowSchema = v.object({ id: v.string() });

export function parseRows<TSchema extends v.GenericSchema>(
  schema: TSchema,
  rows: unknown,
): v.InferOutput<TSchema>[] {
  return v.parse(v.array(schema), rows);
}

// node-postgres treats JavaScript arrays as Postgres arrays. JSON.stringify at
// the boundary makes JSONB writes identical under the server and serverless
// drivers and rejects values (such as undefined) that JSON cannot represent.
export function serializeJson(value: unknown): string {
  const json = JSON.stringify(value);
  if (json === undefined) throw new TypeError("Database JSON value is not serializable");
  return json;
}
