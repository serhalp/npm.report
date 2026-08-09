import { getDatabase, type DatabaseConnection } from "@netlify/database";

let connection: DatabaseConnection | undefined;

// Keep connection creation lazy. An audit can still run and stream its result
// when Database has not been provisioned; only the final save then fails, and
// audit-stream already reports that failure separately from the audit itself.
export function getDb(): DatabaseConnection {
  connection ??= getDatabase();
  return connection;
}
