import type { Config } from "@netlify/functions";
import { processDueTrustReruns } from "./_shared/report-schedules.js";

export default async () => {
  const result = await processDueTrustReruns();
  console.log(
    `[trust-reruns] checked=${result.checked} succeeded=${result.succeeded} failed=${result.failed}`,
  );
};

export const config: Config = {
  schedule: "@hourly",
  background: true,
};
