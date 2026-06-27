CREATE TABLE "reports" (
	"id" text PRIMARY KEY,
	"orgs" text NOT NULL,
	"scope_label" text DEFAULT '' NOT NULL,
	"payload" jsonb NOT NULL,
	"created_at" timestamp DEFAULT now()
);
