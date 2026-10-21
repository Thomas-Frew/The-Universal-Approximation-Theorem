import { z } from "zod";
import { difficultySchema } from "./config.ts";
import { languageSchema, observationSchema } from "./level.ts";

/**
 * One entry in a player's log beyond the free samples: something they asked
 * the machine (`query`, costs a query) or a hidden case a wrong submission
 * revealed (`revealed`, free).
 */
export const logEntrySchema = observationSchema.extend({
  source: z.enum(["query", "revealed"]),
});
export type LogEntry = z.infer<typeof logEntrySchema>;

/**
 * Where a player stands on a level, for its current version. Every number is
 * counted from stored rows; nothing here is stored as a number.
 */
export const progressSchema = z.object({
  /** `new` until the player queries or submits; `solved` after the first accepted submission. */
  status: z.enum(["new", "in_progress", "solved"]),
  log: z.array(logEntrySchema),
  /** Counted only up to the first accepted submission: solving freezes the penalty. */
  queries: z.number().int().nonnegative(),
  wrongSubmissions: z.number().int().nonnegative(),
  /**
   * `solution` from problem.yaml, saying what the machine does. Secret until
   * earned: the API includes it only when `status` is `solved`.
   */
  solution: z.string().optional(),
  /**
   * The player's own code from their most recent accepted submission, so they
   * can read back what solved it. Present only when `status` is `solved`.
   */
  solvedWith: z.object({ language: languageSchema, code: z.string() }).optional(),
});
export type Progress = z.infer<typeof progressSchema>;

/**
 * One level as the level select shows it: where the player stands, without
 * the log. `locked` until the level before it is solved (see `game.ts`).
 */
export const levelSummarySchema = z.object({
  number: z.number().int().positive(),
  title: z.string().min(1),
  /**
   * 1 to DIFFICULTY_SCALE: the larger of the level's `concept_diff` and `implement_diff`.
   * Only the larger is sent, so a player cannot tell which kind of hard it is.
   */
  difficulty: difficultySchema,
  /** How many players have solved the level's current version: everyone's, not just this player's. */
  // Defaults to 0, so a response from an API that predates the count still
  // reads as "Not yet solved" rather than "undefined".
  solves: z.number().int().nonnegative().default(0),
  status: z.enum(["locked", "new", "in_progress", "solved"]),
  queries: z.number().int().nonnegative(),
  wrongSubmissions: z.number().int().nonnegative(),
});
export type LevelSummary = z.infer<typeof levelSummarySchema>;
