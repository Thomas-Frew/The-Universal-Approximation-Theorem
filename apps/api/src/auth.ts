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
 */
export function createAuth(db: Database, options: { secret: string; baseURL: string }) {
  return betterAuth({
    ...options,
    database: drizzleAdapter(db, { provider: "pg" }),
    plugins: [anonymous()],
    // Better Auth rate-limits by IP in production (signing in anonymously: 3
    // per 10 seconds per address), which is what stops a script minting
    // endless players. In production a request arrives via Cloudflare, then
    // Traefik, so the socket address is Traefik's and X-Forwarded-For holds
    // Cloudflare's edge: every player would share a few buckets. Cloudflare
    // puts the real client in CF-Connecting-IP. X-Forwarded-For is the
    // fallback for when Cloudflare is not in front (Traefik then sets it to
    // the client). Both can be forged by anyone who reaches the droplet
    // directly, which is why the origin should only accept Cloudflare.
    advanced: { ipAddress: { ipAddressHeaders: ["cf-connecting-ip", "x-forwarded-for"] } },
  });
}
