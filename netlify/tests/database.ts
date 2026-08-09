import type { DatabaseConnection } from "@netlify/database";
import { NetlifyDB } from "@netlify/database-dev";
import { fileURLToPath } from "node:url";

const migrationsDirectory = fileURLToPath(new URL("../database/migrations", import.meta.url));

export async function startTestDatabase(): Promise<{
  local: NetlifyDB;
  connectionString: string;
}> {
  const local = new NetlifyDB({ logger: () => {} });
  const connectionString = await local.start();
  await local.applyMigrations(migrationsDirectory);
  return { local, connectionString };
}

export async function resetTestDatabase(database: DatabaseConnection): Promise<void> {
  await database.sql`
    TRUNCATE TABLE
      audit_jobs,
      report_rerun_schedules,
      report_trust_history,
      reports
    RESTART IDENTITY CASCADE
  `;
}

export async function stopTestDatabase(
  local: NetlifyDB | undefined,
  database: DatabaseConnection | undefined,
): Promise<void> {
  if (database) await database.pool.end();
  if (local) await local.stop();
}
