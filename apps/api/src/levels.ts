import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import {
  type Level,
  levelsManifestSchema,
  type Observation,
  problemConfigSchema,
} from "@uat/shared";
import { parse as parseYaml } from "yaml";

const read = (path: string) => readFile(path, "utf8");

/** Case files are named with plain integers from 1: `1.in`, `2.in`, ..., `10.in`. */
const CASE_INPUT = /^([1-9]\d*)\.in$/;

/**
 * Reads every `N.in` / `N.ans` pair in a data folder, in numeric order
 * (`2.in` before `10.in`), which is not the order `readdir` gives.
 */
async function loadCases(dir: string): Promise<Observation[]> {
  const numbers = (await readdir(dir))
    .map((file) => CASE_INPUT.exec(file)?.[1])
    .filter((match) => match !== undefined)
    .map(Number)
    .sort((a, b) => a - b);

  return Promise.all(
    numbers.map(async (n) => ({
      input: await read(join(dir, `${n}.in`)),
      output: await read(join(dir, `${n}.ans`)),
    })),
  );
}

async function loadLevel(dir: string, slug: string, number: number): Promise<Level> {
  const config = problemConfigSchema.parse(
    parseYaml(await read(join(dir, "problem.yaml"))),
  );

  // Built field by field on purpose: this object is sent to the browser, so
  // nothing secret in problem.yaml (`concepts` names the answer) can ride along.
  return {
    id: config.uuid,
    slug,
    version: config.version,
    number,
    title: config.name,
    inputFormat: (await read(join(dir, "statement", "input.tex"))).trim(),
    outputFormat: (await read(join(dir, "statement", "output.tex"))).trim(),
    samples: await loadCases(join(dir, "data", "sample")),
  };
}

/**
 * Loads the client-safe view of every level listed in `levels.yaml`, in play
 * order. Throws on the first level that does not match the expected layout.
 */
export async function loadLevels(levelsDir: string): Promise<Level[]> {
  const manifest = levelsManifestSchema.parse(
    parseYaml(await read(join(levelsDir, "levels.yaml"))),
  );

  const levels = await Promise.all(
    manifest.levels.map((slug, index) =>
      loadLevel(join(levelsDir, slug), slug, index + 1).catch((cause: unknown) => {
        throw new Error(`Could not load level "${slug}"`, { cause });
      }),
    ),
  );

  const ids = new Set(levels.map((level) => level.id));
  if (ids.size !== levels.length) {
    throw new Error("Two levels in levels.yaml share a uuid");
  }
  return levels;
}
