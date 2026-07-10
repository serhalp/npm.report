import {
  getDatabase,
  type DatabaseConnection,
  type ServerlessDatabaseConnection,
} from "@netlify/database";
import { drizzle, type DrizzleClient } from "drizzle-orm/netlify-db";

type ServerlessHttpClient = ServerlessDatabaseConnection["httpClient"];

function createDrizzleCompatibleHttpClient(httpClient: ServerlessHttpClient): ServerlessHttpClient {
  type QueryArgs = Parameters<ServerlessHttpClient["query"]>;

  const query = ((...args: QueryArgs) =>
    httpClient.query(...args)) as ServerlessHttpClient["query"];
  const compatibleHttpClient = ((...args: QueryArgs) =>
    query(...args)) as unknown as ServerlessHttpClient;

  compatibleHttpClient.query = query;
  compatibleHttpClient.unsafe = ((...args: Parameters<ServerlessHttpClient["unsafe"]>) =>
    httpClient.unsafe(...args)) as ServerlessHttpClient["unsafe"];
  compatibleHttpClient.transaction = ((...args: Parameters<ServerlessHttpClient["transaction"]>) =>
    httpClient.transaction(...args)) as ServerlessHttpClient["transaction"];

  return compatibleHttpClient;
}

export function getDrizzleClient(database: DatabaseConnection): DrizzleClient {
  if (database.driver === "server") {
    return database;
  }

  return {
    ...database,
    httpClient: createDrizzleCompatibleHttpClient(database.httpClient),
  };
}

let connection: DrizzleClient | undefined;
function connect(): DrizzleClient {
  connection ??= drizzle({ client: getDrizzleClient(getDatabase()) });
  return connection;
}

// Connect lazily, on first query — NOT at module load. Calling getDatabase() at
// import time meant a missing connection string (e.g. a deploy where Netlify
// Database isn't provisioned) threw while merely importing this module, which
// crashed every function that imports it — including audit-stream, whose audit
// doesn't touch the DB until the final save. Connecting on first use lets the
// audit run and stream its result; only the save then fails, and that path
// already degrades gracefully (the SSE `done` event carries the save error).
export const db = new Proxy(
  {},
  {
    get(_target, prop) {
      const client = connect() as unknown as Record<string | symbol, unknown>;
      const value = client[prop];
      return typeof value === "function" ? value.bind(client) : value;
    },
  },
) as unknown as DrizzleClient;
