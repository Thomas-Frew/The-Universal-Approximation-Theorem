import { join, resolve } from "node:path";

/** Reads the settings the API and the verifier share from the environment. */
export function readConfig() {
  const levelsDir = process.env.LEVELS_DIR;
  if (!levelsDir) {
    throw new Error("Set LEVELS_DIR to a checkout of the levels repo (see .env.example).");
  }
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("Set DATABASE_URL to the Postgres connection string (see .env.example).");
  }
  // Signs session cookies so they cannot be forged. Long and random; one per
  // environment, never committed.
  const authSecret = process.env.BETTER_AUTH_SECRET;
  if (!authSecret || authSecret.length < 32) {
    throw new Error(
      "Set BETTER_AUTH_SECRET to at least 32 random characters, e.g. `openssl rand -base64 32` (see .env.example).",
    );
  }
  // The address the browser uses to reach the API. Better Auth trusts requests
  // from this origin and builds its own links from it.
  const authUrl = process.env.BETTER_AUTH_URL;
  if (!authUrl) {
    throw new Error("Set BETTER_AUTH_URL to the address the browser uses (see .env.example).");
  }

  return {
    levelsDir: resolve(levelsDir),
    databaseUrl,
    authSecret,
    authUrl,
    /** Where compiled validators and machines are kept between runs. */
    /** Where Judge0 is. Without it the API runs, but cannot judge submissions. */
    judge0Url: process.env.JUDGE0_URL?.replace(/\/+$/, "") || null,
    /** DEBUG=true: keep details in player-facing messages that are normally trimmed. */
    debug: ["1", "true"].includes(process.env.DEBUG?.toLowerCase() ?? ""),
    cacheDir: resolve(process.env.CACHE_DIR ?? join(import.meta.dirname, "..", ".cache")),
  };
}
