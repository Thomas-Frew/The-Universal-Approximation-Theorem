import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { anonymous } from "better-auth/plugins";
import { drizzle } from "drizzle-orm/postgres-js";

/**
 * Read only by Better Auth's schema generator (`pnpm db:auth-schema`), which
 * needs an `auth` export to inspect. It never connects to anything.
 *
 * It cannot import `src/auth.ts` (the generator's loader fails on our relative
 * imports), so it repeats the one thing that shapes the tables: the plugin
 * list. Keep `plugins` the same as in `src/auth.ts`.
 */
export const auth = betterAuth({
  secret: "schema-generation-only",
  baseURL: "http://localhost",
  database: drizzleAdapter(drizzle.mock(), { provider: "pg" }),
  plugins: [anonymous()],
});
