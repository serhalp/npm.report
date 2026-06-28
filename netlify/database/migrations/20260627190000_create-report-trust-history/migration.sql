CREATE TABLE "report_trust_history" (
	"report_id" text PRIMARY KEY,
	"org_key" text NOT NULL,
	"orgs_json" jsonb NOT NULL,
	"captured_at" timestamp NOT NULL,
	"total" integer NOT NULL,
	"staged_publish" integer NOT NULL,
	"trusted_publisher" integer NOT NULL,
	"provenance" integer NOT NULL,
	"none" integer NOT NULL,
	"deprecated" integer NOT NULL,
	"failure_count" integer NOT NULL,
	CONSTRAINT "report_trust_history_report_id_reports_id_fk"
		FOREIGN KEY ("report_id") REFERENCES "reports"("id") ON DELETE cascade
);

CREATE INDEX "report_trust_history_org_key_idx" ON "report_trust_history" ("org_key");
CREATE INDEX "report_trust_history_captured_at_idx" ON "report_trust_history" ("captured_at");
