import { loadKeyRequestSchema } from "@uat/shared";
import { type BetterAuthPlugin, betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { APIError, createAuthEndpoint } from "better-auth/api";
import { setSessionCookie } from "better-auth/cookies";
import { anonymous } from "better-auth/plugins";
import type { Database } from "./db/index.ts";

/**
 * `POST /api/auth/save-key/load`: signs this browser in as the player a save
 * key belongs to (see `profiles.ts`). It makes a session for that player and
 * sets the session cookie, exactly as signing in anonymously does, so the
 * rest of the game sees an ordinary session. The browser's previous player
 * is left as it was; with its own key it can be loaded again later.
 *
 * Deliberately not under /sign-in: the anonymous plugin watches paths
 * starting /sign-in and would delete the previous anonymous player.
 *
 * Adds no tables, so `better-auth.config.ts` need not list it.
 */
function saveKeys(findPlayerByKey: (key: string) => Promise<string | null>): BetterAuthPlugin {
  return {
    id: "save-keys",
    endpoints: {
      loadSaveKey: createAuthEndpoint(
        "/save-key/load",
        { method: "POST", body: loadKeyRequestSchema },
        async (ctx) => {
          const userId = await findPlayerByKey(ctx.body.key);
          const user = userId ? await ctx.context.internalAdapter.findUserById(userId) : null;
          if (!user) throw new APIError("BAD_REQUEST", { message: "No player has that key." });
          const session = await ctx.context.internalAdapter.createSession(user.id);
          await setSessionCookie(ctx, { session, user });
          return ctx.json({ ok: true });
        },
      ),
    },
    // Keys are 80 random bits, so guessing is hopeless anyway; this keeps
    // anyone from trying at speed. Per address, like Better Auth's own limits.
    rateLimit: [{ pathMatcher: (path) => path === "/save-key/load", window: 60, max: 10 }],
  };
}

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
export function createAuth(
  db: Database,
  options: { secret: string; baseURL: string },
  findPlayerByKey: (key: string) => Promise<string | null>,
) {
  return betterAuth({
    ...options,
    database: drizzleAdapter(db, { provider: "pg" }),
    plugins: [anonymous(), saveKeys(findPlayerByKey)],
    // A session lasts 365 days from the player's last visit (Better Auth
    // pushes the expiry forward at most once a day, `updateAge`). The default
    // of 7 days turned anyone away for a week into a new anonymous player.
    session: { expiresIn: 60 * 60 * 24 * 365 },
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
