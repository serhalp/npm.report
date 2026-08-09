import { getConnectionString, getDatabase, type DatabaseConnection } from "@netlify/database";

let connection: DatabaseConnection | undefined;

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

function createConnection(): DatabaseConnection {
  const connectionString = getConnectionString();
  const url = new URL(connectionString);

  if (!url.username && LOOPBACK_HOSTS.has(url.hostname)) {
    // XXX(serhalp): Remove once Netlify's local Database URL includes a username.
    url.username = "postgres";
    return getDatabase({ connectionString: url.toString() });
  }

  return getDatabase();
}

// Keep connection creation lazy. An audit can still run and stream its result
// when Database has not been provisioned; only the final save then fails, and
// audit-stream already reports that failure separately from the audit itself.
export function getDb(): DatabaseConnection {
  connection ??= createConnection();
  return connection;
}
