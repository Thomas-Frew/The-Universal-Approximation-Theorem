import { join } from "node:path";
import { normaliseInput, outputsMatch } from "@uat/shared";
import { readLevelsConfig } from "./config.ts";
import {
  type Case,
  type LoadedLevel,
  listFiles,
  loadCases,
  loadLevels,
  readManifest,
} from "./levels.ts";
import { prepare, run } from "./programs.ts";

/**
 * Checks every level in LEVELS_DIR with the same loader, compiler and runner
 * the API uses, so a level that passes here is a level the game can serve.
 * Run it with `pnpm verify`. Exits with 1 if anything is wrong.
 */

const VALIDATOR_TIMEOUT_MS = 5_000;
/** Enough hidden cases that a solution cannot pass by luck or by special cases. */
const MIN_SECRET_CASES = 20;

/** Returns what is wrong with the level, one line per problem. Empty means it passed. */
async function verifyLevel(loaded: LoadedLevel, cacheDir: string): Promise<string[]> {
  const problems: string[] = [];
  const samples = await loadCases(join(loaded.dir, "data", "sample"));
  const secrets = await loadCases(join(loaded.dir, "data", "secret"));
  if (samples.length === 0) problems.push("data/sample has no cases");
  if (secrets.length < MIN_SECRET_CASES) {
    problems.push(`data/secret has ${secrets.length} cases; at least ${MIN_SECRET_CASES} are needed`);
  }

  const cases: [string, Case][] = [
    ...samples.map((c): [string, Case] => [`sample/${c.name}`, c]),
    ...secrets.map((c): [string, Case] => [`secret/${c.name}`, c]),
  ];

  for (const [label, { input, output }] of cases) {
    // A test input must already be in the form a typed query is normalised to.
    if (normaliseInput(input) !== input) {
      problems.push(
        `${label}.in is not in the form a typed query becomes: no repeated, leading or trailing blanks, LF line ends, one final newline`,
      );
    }

    const validation = await run(loaded.validator, input, VALIDATOR_TIMEOUT_MS);
    if (validation.exitCode !== 0) {
      problems.push(`${label}.in is rejected by the validator: ${validation.stderr.trim()}`);
      continue;
    }

    // Twice, to catch a machine that is not deterministic. A mismatch with the
    // committed .ans means the answers are stale: the machine was edited
    // without regenerating them.
    for (const attempt of [1, 2]) {
      const answer = await run(loaded.machine, input, loaded.timeLimitMs);
      if (answer.timedOut) {
        problems.push(`${label}: the machine exceeded the time limit (run ${attempt})`);
      } else if (answer.exitCode !== 0) {
        problems.push(`${label}: the machine exited with code ${answer.exitCode} (run ${attempt})`);
      } else if (answer.stdout !== output) {
        problems.push(
          `${label}.ans is stale (run ${attempt}): the machine prints ` +
            `${JSON.stringify(answer.stdout)}, the file holds ${JSON.stringify(output)}`,
        );
      } else {
        continue;
      }
      break;
    }
  }

  // Each near-miss solution must be caught by at least one secret case,
  // judged the way a player's submission will be.
  for (const source of await listFiles(join(loaded.dir, "submissions", "wrong_answer"))) {
    const wrong = await prepare(source, cacheDir);
    let caught = false;
    for (const { input, output } of secrets) {
      const answer = await run(wrong, input, loaded.timeLimitMs);
      if (answer.timedOut || answer.exitCode !== 0 || !outputsMatch(answer.stdout, output)) {
        caught = true;
        break;
      }
    }
    if (!caught) problems.push(`${source} passes every secret case, so the tests are too weak`);
  }

  return problems;
}

const { levelsDir, cacheDir } = readLevelsConfig();
// Loading already checks problem.yaml, the statements, the single accepted
// file, unique uuids, and that the validator and machine compile.
// Every level that can be played: the main list, plus the demo if it sits outside it.
const manifest = await readManifest(levelsDir);
const slugs = [...new Set([...manifest.levels, ...(manifest.demo ? [manifest.demo] : [])])];
const levels = await loadLevels(levelsDir, cacheDir, slugs);

let failed = false;
for (const loaded of levels) {
  const problems = await verifyLevel(loaded, cacheDir);
  console.log(`${problems.length === 0 ? "ok  " : "FAIL"} ${loaded.level.slug}`);
  for (const problem of problems) console.log(`     - ${problem}`);
  failed ||= problems.length > 0;
}
process.exitCode = failed ? 1 : 0;
