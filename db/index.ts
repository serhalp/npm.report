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

export const db = drizzle({ client: getDrizzleClient(getDatabase()) });
