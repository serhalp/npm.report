CREATE INDEX "report_trust_history_org_key_captured_at_idx"
  ON "report_trust_history" ("org_key", "captured_at" DESC);
