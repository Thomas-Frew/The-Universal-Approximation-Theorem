import { z } from "zod";

/** Folder name of a level in the levels repo, e.g. `doubling-lens`. */
export const levelSlugSchema = z
  .string()
  .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "Use lowercase letters, digits and hyphens");

/**
 * `levels.yaml` at the root of the levels repo: the slugs in play order.
 * A folder that is not listed here is not part of the game.
 */
export const levelsManifestSchema = z.object({
  levels: z.array(levelSlugSchema).min(1),
});
export type LevelsManifest = z.infer<typeof levelsManifestSchema>;

/**
 * `<slug>/problem.yaml`. A subset of the Kattis problem package format, plus
 * our own `version`. Unknown Kattis keys (author, license, ...) are ignored.
 */
export const problemConfigSchema = z.object({
  /** The level title shown to players. */
  name: z.string().min(1),
  /** Stable identity of the level. Survives renaming the folder. */
  uuid: z.uuid(),
  /** Bump whenever the machine, validator or test data changes. */
  version: z.number().int().positive(),
  limits: z
    .object({
      /** Seconds. */
      time_limit: z.number().positive().default(1),
      /** Mebibytes. */
      memory: z.number().int().positive().default(256),
    })
    .prefault({}),
});
export type ProblemConfig = z.infer<typeof problemConfigSchema>;

/** One input and the machine's output for it. */
export const observationSchema = z.object({
  input: z.string(),
  output: z.string(),
});
export type Observation = z.infer<typeof observationSchema>;

/**
 * What the API sends the browser about a level. Deliberately has no machine
 * source and no hidden tests: only the samples, which are free to see.
 */
export const levelSchema = z.object({
  id: z.uuid(),
  slug: levelSlugSchema,
  version: z.number().int().positive(),
  /** 1-based position in play order. */
  number: z.number().int().positive(),
  title: z.string().min(1),
  /** Contents of `statement/input.tex`. */
  inputFormat: z.string(),
  /** Contents of `statement/output.tex`. */
  outputFormat: z.string(),
  /** `data/sample/*`: shown in the observation log at no penalty. */
  samples: z.array(observationSchema),
});
export type Level = z.infer<typeof levelSchema>;

/** Languages a player can submit in. */
export const languageSchema = z.enum(["python", "cpp", "go"]);
export type Language = z.infer<typeof languageSchema>;
