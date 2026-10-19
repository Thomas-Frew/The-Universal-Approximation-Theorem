import postgres from "postgres";

/**
 * Empties the local database: every player, session, observation, submission
 * and cached machine answer. The tables themselves stay, so there is no need
 * to migrate again. Run with `pnpm db:reset`.
 *
 * Refuses to touch anything but a database on this machine.
 */

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("Set DATABASE_URL in apps/api/.env (see .env.example).");
  process.exit(1);
}

const host = new URL(url).hostname;
if (!["localhost", "127.0.0.1", "::1"].includes(host)) {
  console.error(`Refusing to reset ${host}: db:reset only empties a local database.`);
  process.exit(1);
}

const sql = postgres(url, { onnotice: () => {} });
try {
  // Our tables and Better Auth's all live in the `public` schema. drizzle-kit's
  // record of applied migrations lives in its own schema, so it survives.
  const tables = await sql<{ name: string }[]>`
    select tablename as name from pg_tables where schemaname = 'public'
  `;
  if (tables.length === 0) {
    console.log("No tables to empty. Run `pnpm db:migrate` first.");
  } else {
    const names = tables.map(({ name }) => name);
    // sql(names) quotes each name as a table name, never as a value. One
    // statement, so the tables are emptied together; RESTART IDENTITY starts
    // the id counters from 1 again.
    await sql`truncate ${sql(names)} restart identity cascade`;
    console.log(`Emptied ${names.length} tables: ${names.join(", ")}.`);
    console.log("Reload the game: the browser's old session is gone, so it starts a new player.");
  }
} finally {
  await sql.end();
}
