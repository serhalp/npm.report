CREATE TABLE "audit_jobs" (
	"id" text PRIMARY KEY,
	"request" jsonb NOT NULL,
	"log" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"status" text DEFAULT 'running' NOT NULL,
	"result" jsonb,
	"report_id" text,
	"error" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE INDEX "audit_jobs_created_at_idx" ON "audit_jobs" ("created_at");
