import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import {
  type Level,
  type LevelsManifest,
  levelsManifestSchema,
  type Observation,
  problemConfigSchema,
} from "@uat/shared";
import { parse as parseYaml } from "yaml";
import { prepare, type Program } from "./programs.ts";

const read = (path: string) => readFile(path, "utf8");

/** A level as the API holds it: the client-safe view plus what must stay here. */
export type LoadedLevel = {
  /** The only part that may be sent to the browser. */
  level: Level;
  dir: string;
  timeLimitMs: number;
  memoryLimitKb: number;
  /** Hidden tests, in judging order. Never sent to the browser as a set. */
  secrets: Case[];
  /** What the machine does, in one sentence. Sent only to a player who has solved the level. */
  solution: string;
  /** 1 to DIFFICULTY_SCALE, the larger of `concept_diff` and `implement_diff`; shown on the level select. */
  difficulty: number;
  validator: Program;
  machine: Program;
};

/** One test case, with its file name (`3` for `3.in`) for error messages. */
export type Case = Observation & { name: string };

/** Case files are named with plain integers from 1: `1.in`, `2.in`, ..., `10.in`. */
const CASE_INPUT = /^([1-9]\d*)\.in$/;

/**
 * Reads every `N.in` / `N.ans` pair in a data folder, in numeric order
 * (`2.in` before `10.in`), which is not the order `readdir` gives.
 */
export async function loadCases(dir: string): Promise<Case[]> {
  const numbers = (await readdir(dir))
    .map((file) => CASE_INPUT.exec(file)?.[1])
    .filter((match) => match !== undefined)
    .map(Number)
    .sort((a, b) => a - b);

  return Promise.all(
    numbers.map(async (n) => ({
      name: String(n),
      input: await read(join(dir, `${n}.in`)),
      output: await read(join(dir, `${n}.ans`)),
    })),
  );
}

/** Full paths of the files in a folder, ignoring dotfiles such as `.DS_Store`. */
export async function listFiles(dir: string): Promise<string[]> {
  const names = await readdir(dir).catch(() => []);
  return names
    .filter((name) => !name.startsWith("."))
    .sort()
    .map((name) => join(dir, name));
}

async function readStatement(path: string): Promise<string> {
  const text = (await read(path)).trim();
  if (!text) throw new Error(`${path} is empty`);
  return text;
}

async function loadLevel(
  levelsDir: string,
  cacheDir: string,
  slug: string,
  number: number,
): Promise<LoadedLevel> {
  const dir = join(levelsDir, "levels", slug);
  const config = problemConfigSchema.parse(
    parseYaml(await read(join(dir, "problem.yaml"))),
  );

  const accepted = await listFiles(join(dir, "submissions", "accepted"));
  const [machineSource] = accepted;
  if (accepted.length !== 1 || !machineSource) {
    throw new Error(`submissions/accepted must hold exactly one file, found ${accepted.length}`);
  }

  const samples = await loadCases(join(dir, "data", "sample"));

  return {
    // Built field by field on purpose: this object is sent to the browser, so
    // nothing secret in problem.yaml (`concepts` names the answer) can ride along.
    level: {
      id: config.uuid,
      slug,
      version: config.version,
      number,
      title: config.name,
      inputFormat: await readStatement(join(dir, "statement", "input.tex")),
      outputFormat: await readStatement(join(dir, "statement", "output.tex")),
      samples: samples.map(({ input, output }) => ({ input, output })),
    },
    dir,
    timeLimitMs: config.limits.time_limit * 1000,
    memoryLimitKb: config.limits.memory * 1024,
    secrets: await loadCases(join(dir, "data", "secret")),
    solution: config.solution,
    difficulty: Math.max(config.concept_diff, config.implement_diff),
    validator: await prepare(join(dir, "input_validators", "validate.cpp"), cacheDir, [
      join(levelsDir, "include", "testlib.h"),
    ]),
    machine: await prepare(machineSource, cacheDir),
  };
}

/** Reads `levels.yaml`: the play order, and which level is the demo. */
export async function readManifest(levelsDir: string): Promise<LevelsManifest> {
  return levelsManifestSchema.parse(parseYaml(await read(join(levelsDir, "levels.yaml"))));
}

/**
 * Loads the given level folders, numbered 1, 2, ... in that order, compiling
 * each validator and machine. Throws on the first level that does not match
 * the expected layout.
 */
export async function loadLevels(
  levelsDir: string,
  cacheDir: string,
  slugs: readonly string[],
): Promise<LoadedLevel[]> {
  const levels = await Promise.all(
    slugs.map((slug, index) =>
      loadLevel(levelsDir, cacheDir, slug, index + 1).catch((cause: unknown) => {
        throw new Error(`Could not load level "${slug}"`, { cause });
      }),
    ),
  );

  const ids = new Set(levels.map(({ level }) => level.id));
  if (ids.size !== levels.length) {
    throw new Error("Two levels share a uuid");
  }
  return levels;
}
