import type { Config } from "@netlify/functions";
import { deleteExpiredJobs } from "../_shared/audit-jobs.js";

// Prune throwaway `audit_jobs` rows. Interactive audits persist their resumable
// progress there, but the durable artifact is the saved report in `reports`, so a
// job row is dead weight once no client is still reconnecting to it. This runs on
// its own schedule — deliberately NOT folded into trust-reruns-background, which
// does an unrelated job.
export default async () => {
  await deleteExpiredJobs();
  console.log("[audit-jobs-cleanup] pruned audit jobs older than 2h");
};

export const config: Config = {
  schedule: "@hourly",
  background: true,
};
