import { join, resolve } from "node:path";

/** Reads the settings the API and the verifier share from the environment. */
export function readConfig() {
  const levelsDir = process.env.LEVELS_DIR;
  if (!levelsDir) {
    throw new Error("Set LEVELS_DIR to a checkout of the levels repo (see .env.example).");
  }
  return {
    levelsDir: resolve(levelsDir),
    /** Where compiled validators and machines are kept between runs. */
    /** Where Judge0 is. Without it the API runs, but cannot judge submissions. */
    judge0Url: process.env.JUDGE0_URL?.replace(/\/+$/, "") || null,
    /** DEBUG=true: keep details in player-facing messages that are normally trimmed. */
    debug: ["1", "true"].includes(process.env.DEBUG?.toLowerCase() ?? ""),
    cacheDir: resolve(process.env.CACHE_DIR ?? join(import.meta.dirname, "..", ".cache")),
  };
}
