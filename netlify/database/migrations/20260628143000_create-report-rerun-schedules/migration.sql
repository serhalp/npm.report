CREATE TABLE "report_rerun_schedules" (
	"org_key" text PRIMARY KEY,
	"orgs_json" jsonb NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"next_run_at" timestamp NOT NULL,
	"last_run_at" timestamp,
	"last_report_id" text,
	"last_error" text,
	"consecutive_failures" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "report_rerun_schedules_last_report_id_reports_id_fk"
		FOREIGN KEY ("last_report_id") REFERENCES "reports"("id") ON DELETE set null
);

CREATE INDEX "report_rerun_schedules_enabled_next_run_at_idx"
	ON "report_rerun_schedules" ("enabled", "next_run_at");
CREATE INDEX "report_rerun_schedules_last_report_id_idx"
	ON "report_rerun_schedules" ("last_report_id");
