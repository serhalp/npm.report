import type { Config } from "@netlify/functions";
import { processDueTrustReruns } from "#node/report-schedules";

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
