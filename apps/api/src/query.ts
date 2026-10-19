import type { QueryResult } from "@uat/shared";
import type { LoadedLevel } from "./levels.ts";
import { run } from "./programs.ts";

const VALIDATOR_TIMEOUT_MS = 5_000;

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
 * Asks a level's machine about an input that is already normalised: check it
 * with the level's validator, then run the machine. Knows nothing about players
 * or caching; `game.ts` does both around it.
 */
export async function askMachine(
  loaded: LoadedLevel,
  input: string,
  { debug }: { debug: boolean },
): Promise<QueryResult> {
  const validation = await run(loaded.validator, input, VALIDATOR_TIMEOUT_MS);
  if (validation.exitCode !== 0) {
    return { status: "rejected", message: validatorMessage(validation.stderr, debug) };
  }

  const answer = await run(loaded.machine, input, loaded.timeLimitMs);
  if (answer.timedOut || answer.exitCode !== 0) {
    // The validator accepted this input, so the fault is ours, not the player's.
    throw new Error(
      `Machine for "${loaded.level.slug}" failed on valid input ${JSON.stringify(input)}: ` +
        (answer.timedOut ? "timed out" : `exit code ${answer.exitCode}\n${answer.stderr}`),
    );
  }
  return { status: "ok", input, output: answer.stdout };
}
