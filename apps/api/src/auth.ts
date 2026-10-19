import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { anonymous } from "better-auth/plugins";
import type { Database } from "./db/index.ts";

/**
 * Player identity. Every visitor becomes a user on first visit through the
 * anonymous plugin, identified by an httpOnly session cookie; signing up later
 * links an email and password to that same user.
 *
 * Better Auth owns its tables (`user`, `session`, `account`, `verification`).
 * Their Drizzle definitions in `db/auth-schema.ts` are generated with
 * `pnpm --filter @uat/api db:auth-schema`. If `plugins` changes here, change it
 * in `better-auth.config.ts` too and regenerate.
 *
 * Not wired into the API yet: that is the next step.
 */
export function createAuth(db: Database, options: { secret: string; baseURL: string }) {
  return betterAuth({
    ...options,
    database: drizzleAdapter(db, { provider: "pg" }),
    plugins: [anonymous()],
  });
}
