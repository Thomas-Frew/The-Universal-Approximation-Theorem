import { z } from "zod";
import { difficultySchema } from "./config.ts";

/** Folder name of a level, under `levels/` in the levels repo, e.g. `duplicator`. */
export const levelSlugSchema = z
  .string()
  .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "Use lowercase letters, digits and hyphens");

/**
 * `levels.yaml` at the root of the levels repo: the slugs in play order.
 * A folder that is not listed here is not part of the game.
 */
export const levelsManifestSchema = z.object({
  levels: z.array(levelSlugSchema).min(1),
  /**
   * The level the public demo (DEMO_MODE) consists of. It does not have to be
   * one of `levels`: a demo-only level can sit outside the main game.
   */
  demo: levelSlugSchema.optional(),
});
export type LevelsManifest = z.infer<typeof levelsManifestSchema>;

/**
 * `<slug>/problem.yaml`. A subset of the Kattis problem package format, plus
 * our own `version`, `concepts` and the two difficulties. Unknown Kattis keys
 * (author, license, ...) are ignored.
 */
export const problemConfigSchema = z.object({
  /** The level title shown to players. */
  name: z.string().min(1),
  /** Stable identity of the level. Survives renaming the folder. */
  uuid: z.uuid(),
  /** Bump whenever the machine, validator or test data changes. */
  version: z.number().int().positive(),
  /** The idea behind the machine. Names the answer, so it is secret. */
  concepts: z.array(z.string().min(1)).min(1),
  /** 1 to DIFFICULTY_SCALE (8): how hard the logic is to spot from the samples. */
  concept_diff: difficultySchema,
  /** 1 to DIFFICULTY_SCALE (8): how hard the solution is to code once the logic is known. */
  implement_diff: difficultySchema,
  /** One plain-text sentence saying what the machine does. Secret, like `concepts`. */
  solution: z.string().min(1),
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
  /** `data/sample/*` in numeric order: shown in the observation log at no penalty. */
  samples: z.array(observationSchema),
});
export type Level = z.infer<typeof levelSchema>;

/** Languages a player can submit in, as a tuple so the database enum can reuse it. */
export const LANGUAGES = ["python", "cpp", "go"] as const;
export const languageSchema = z.enum(LANGUAGES);
export type Language = z.infer<typeof languageSchema>;
