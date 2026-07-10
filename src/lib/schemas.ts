// Valibot schemas for every JSON that crosses a trust boundary: the request
// body of POST /api/reports (server) and every API response the client
// deserializes. Parsing here replaces bare `as T` casts so a malformed payload
// degrades gracefully (e.g. a bad shared-report payload shows an error instead
// of throwing inside a view) rather than being trusted blindly.
//
// Objects use `looseObject` so unknown/extra keys pass through — we validate the
// fields the app actually reads, not the exact shape.
import * as v from "valibot";

const TrustLevel = v.picklist(["stagedPublish", "trustedPublisher", "provenance", "none"]);

const ByLevel = v.object({
  stagedPublish: v.number(),
  trustedPublisher: v.number(),
  provenance: v.number(),
  none: v.number(),
});

const RecentRow = v.looseObject({
  pkg: v.string(),
  latestPublish: v.string(),
  version: v.string(),
  level: TrustLevel,
  provenance: v.boolean(),
  trustedPublisher: v.boolean(),
  stagedPublish: v.boolean(),
  publisher: v.string(),
  deprecated: v.boolean(),
  downloads: v.nullable(v.number()),
});

const RecentReport = v.looseObject({
  rows: v.array(RecentRow),
  summary: v.looseObject({
    scopeLabel: v.string(),
    orgs: v.array(v.string()),
    total: v.number(),
    provenance: v.number(),
    trustedPublisher: v.number(),
    stagedPublish: v.number(),
    deprecated: v.number(),
    byLevel: ByLevel,
  }),
});

const ManualReport = v.looseObject({
  rows: v.array(v.looseObject({ when: v.string(), who: v.string(), ref: v.string() })),
  totalScanned: v.number(),
  bots: v.array(v.string()),
  byPublisher: v.array(v.looseObject({ who: v.string(), count: v.number() })),
});

const ExternalReport = v.looseObject({
  rows: v.array(v.looseObject({ user: v.string(), pkg: v.string() })),
  distinctUsers: v.number(),
  byUser: v.array(v.looseObject({ user: v.string(), count: v.number() })),
});

const FetchFailure = v.looseObject({ url: v.string(), reason: v.string() });

/** A completed audit result. recent/manual/external are present only for the
 *  reports that were run; failures is always an array. */
export const AuditResultSchema = v.looseObject({
  recent: v.optional(RecentReport),
  manual: v.optional(ManualReport),
  external: v.optional(ExternalReport),
  failures: v.array(FetchFailure),
});

/** The row returned by GET /api/reports/:id and rendered read-only at /report/:id. */
export const ReportRecordSchema = v.looseObject({
  id: v.string(),
  orgs: v.string(),
  scopeLabel: v.string(),
  payload: AuditResultSchema,
  createdAt: v.nullable(v.string()),
});

const TrustHistoryPoint = v.looseObject({
  id: v.string(),
  url: v.string(),
  capturedAt: v.string(),
  total: v.number(),
  byLevel: ByLevel,
  deprecated: v.number(),
  failureCount: v.number(),
});

/** GET /api/reports/history?org=... */
export const ReportHistoryResponseSchema = v.looseObject({
  orgs: v.array(v.string()),
  points: v.array(TrustHistoryPoint),
});

/** GET /api/reports/recent */
export const RecentTrustReportsResponseSchema = v.looseObject({
  reports: v.array(
    v.looseObject({
      id: v.string(),
      url: v.string(),
      orgs: v.array(v.string()),
      capturedAt: v.string(),
    }),
  ),
});

/** POST /api/reports/:id/schedule-daily */
export const ReportRerunScheduleStatusSchema = v.looseObject({
  orgs: v.array(v.string()),
  enabled: v.boolean(),
  nextRunAt: v.string(),
  lastRunAt: v.nullable(v.string()),
  lastReportId: v.nullable(v.string()),
  consecutiveFailures: v.number(),
});

// --- server side ---------------------------------------------------------

// Envelope for POST /api/reports. Deliberately lenient on the payload internals
// (stored as opaque JSON; only extractTrustHistory reads specific fields) — the
// payload just has to be a JSON object. orgs/scope/scopeLabel/capturedAt are
// optional and coerced downstream. Strict payload rejection + a size cap belong
// with the write-path/abuse hardening, not here.
export const ReportPostBodySchema = v.object({
  // Left as unknown to match the handler's existing lenient coercion (e.g.
  // non-array orgs -> []); the only hard requirement is a present object payload.
  orgs: v.optional(v.unknown()),
  scope: v.optional(v.unknown()),
  scopeLabel: v.optional(v.unknown()),
  capturedAt: v.optional(v.unknown()),
  payload: v.looseObject({}),
});

// POST /api/audit-stream — the interactive audit request. The server runs the
// audit from this (the browser no longer computes it), so this is the trust
// boundary: whatever the server produces from a validated request is authoritative.
export const AuditRequestSchema = v.object({
  orgs: v.array(v.string()),
  kinds: v.array(v.picklist(["recent", "manual", "external"])),
  months: v.optional(v.number(), 12),
  all: v.optional(v.boolean(), true),
  bots: v.optional(v.array(v.string()), []),
  members: v.optional(v.array(v.string()), []),
});

// POST /api/user-publishes-stream — the per-user publish-history request.
export const UserPublishRequestSchema = v.object({
  user: v.string(),
  months: v.optional(v.number(), 12),
  useCachePackages: v.optional(v.array(v.string()), []),
});

// The user-publishes result streamed back for the client to render.
export const UserPublishReportSchema = v.looseObject({
  user: v.string(),
  scanned: v.number(),
  rows: v.array(v.looseObject({ when: v.string(), ref: v.string() })),
});

/** Parse `value` against `schema`, returning the typed value or null on failure. */
export function parseOrNull<TSchema extends v.GenericSchema>(
  schema: TSchema,
  value: unknown,
): v.InferOutput<TSchema> | null {
  const result = v.safeParse(schema, value);
  return result.success ? result.output : null;
}
