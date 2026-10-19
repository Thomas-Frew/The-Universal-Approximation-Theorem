import type { QueryResult } from "@uat/shared";
import type { LoadedLevel } from "./levels.ts";
import { run } from "./programs.ts";

const VALIDATOR_TIMEOUT_MS = 5_000;

/**
 * testlib's own wording for its standard checks, and what a player is told
 * instead. Matched against the reason after `FAIL ` and before the stream
 * position. A message a validator writes itself (with `ensuref` or `quitf`)
 * matches none of these and is shown as written.
 */
const FRIENDLY_MESSAGES: [RegExp, (...parts: string[]) => string][] = [
  [
    /^Integer parameter \[name=(.+?)\] equals to (-?\d+), violates the range \[(-?\d+), (-?\d+)\]$/,
    (name, value, low, high) => `${name} must be from ${low} to ${high}, not ${value}.`,
  ],
  [
    /^Integer parameter equals to (-?\d+), violates the range \[(-?\d+), (-?\d+)\]$/,
    (value, low, high) => `Each number must be from ${low} to ${high}, not ${value}.`,
  ],
  [/^Expected integer, but "(.*)" found$/, (found) => `Expected a whole number, not "${found}".`],
  [/^Expected double, but "(.*)" found$/, (found) => `Expected a number, not "${found}".`],
  // testlib reads the end of a line as character #0 or #10 here.
  [/^Unexpected character #(0|10), but ' ' expected$/, () => "The line ends too soon: something is missing."],
  [/^Unexpected character '(.)', but ' ' expected$/, (found) => `Expected a space, not "${found}".`],
  [/^Unexpected white-space - token expected$/, () => "Something is missing here."],
  [/^Expected EOLN$/, () => "There is more on this line than expected."],
  [/^Expected EOF$/, () => "There are more lines than expected."],
];

/**
 * testlib writes `FAIL <reason> (stdin, line 1)`. The player gets the reason in
 * plain words; where in the stream it went wrong is added in debug mode only.
 */
function validatorMessage(stderr: string, debug: boolean): string {
  const raw = stderr.trim().replace(/^FAIL\s+/, "");
  const position = /\s*(\(stdin[^)]*\))$/.exec(raw);
  const reason = position ? raw.slice(0, position.index) : raw;

  let message = reason;
  for (const [pattern, rewrite] of FRIENDLY_MESSAGES) {
    const match = pattern.exec(reason);
    if (match) {
      message = rewrite(...match.slice(1));
      break;
    }
  }
  if (!message) message = "The input is not valid.";
  return debug && position ? `${message} ${position[1]}` : message;
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
