import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema.ts";

/**
 * The connection to Postgres. `postgres` keeps a small pool of connections and
 * hands one out per query; Drizzle sits on top and turns typed queries into SQL.
 */
export function connect(databaseUrl: string) {
  const client = postgres(databaseUrl, {
    // Postgres prints notices (e.g. "relation already exists, skipping")
    // that are not errors; keep them out of the log.
    onnotice: () => {},
  });
  return drizzle(client, { schema });
}

export type Database = ReturnType<typeof connect>;

/**
 * Fails fast, with a message that says what to do, if Postgres is not there.
 * Without it the game has nowhere to keep progress, so there is no point starting.
 */
export async function checkConnection(db: Database, databaseUrl: string): Promise<string> {
  try {
    const [row] = await db.$client`select version()`;
    return String(row?.version);
  } catch (cause) {
    // Name the host, never the whole URL: it holds the password.
    const { hostname, port } = new URL(databaseUrl);
    throw new Error(
      `Could not reach Postgres at ${hostname}:${port || 5432}. ` +
        "Locally, start it with `pnpm db:up`. In Dokploy, check the database is deployed " +
        "and DATABASE_URL is its internal connection URL.",
      { cause },
    );
  }
}
