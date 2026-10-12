import { type Level, normaliseText, type QueryResult } from "@uat/shared";
import type { LoadedLevel } from "./levels.ts";
import { run } from "./programs.ts";

const VALIDATOR_TIMEOUT_MS = 5_000;
/** Until Postgres holds the cache: forget the oldest answers past this many. */
const MAX_CACHED_ANSWERS = 10_000;

/**
 * testlib writes `FAIL <reason> (stdin, line 1)`. The player only needs the
 * reason; where in the stream it went wrong is kept in debug mode only.
 */
function validatorMessage(stderr: string, debug: boolean): string {
  let message = stderr.trim().replace(/^FAIL\s+/, "");
  if (!debug) {
    message = message.replace(/\s*\(stdin[^)]*\)$/, "");
  }
  return message || "The input is not valid.";
}

/**
 * Returns the function that answers a query: normalise the input, check it
 * with the level's validator, then ask the machine. Answers are cached by
 * level, version and input, which is safe because machines are deterministic.
 */
export function createQueryRunner(levels: readonly LoadedLevel[], { debug }: { debug: boolean }) {
  const byId = new Map(levels.map((loaded) => [loaded.level.id, loaded]));
  const cache = new Map<string, string>();

  return async (level: Level, rawInput: string): Promise<QueryResult> => {
    const loaded = byId.get(level.id);
    if (!loaded) throw new Error(`Level ${level.id} is not loaded`);

    const input = normaliseText(rawInput);
    const key = JSON.stringify([level.id, level.version, input]);
    const cached = cache.get(key);
    if (cached !== undefined) {
      return { status: "ok", input, output: cached };
    }

    const validation = await run(loaded.validator, input, VALIDATOR_TIMEOUT_MS);
    if (validation.exitCode !== 0) {
      return { status: "rejected", message: validatorMessage(validation.stderr, debug) };
    }

    const answer = await run(loaded.machine, input, loaded.timeLimitMs);
    if (answer.timedOut || answer.exitCode !== 0) {
      // The validator accepted this input, so the fault is ours, not the player's.
      throw new Error(
        `Machine for "${level.slug}" failed on valid input ${JSON.stringify(input)}: ` +
          (answer.timedOut ? "timed out" : `exit code ${answer.exitCode}\n${answer.stderr}`),
      );
    }

    if (cache.size >= MAX_CACHED_ANSWERS) {
      // A Map remembers insertion order, so the first key is the oldest.
      const [oldest] = cache.keys();
      if (oldest !== undefined) cache.delete(oldest);
    }
    cache.set(key, answer.stdout);
    return { status: "ok", input, output: answer.stdout };
  };
}
