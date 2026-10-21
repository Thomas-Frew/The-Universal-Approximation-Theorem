import { z } from "zod";
import rawConfig from "../game.config.json" with { type: "json" };

/**
 * `game.config.json`: the game's rules that are numbers or switches. A
 * committed file and not environment variables, because the web app and the
 * API are deployed separately and must agree on them.
 */
const gameConfigSchema = z.object({
  penalty: z.object({
    /** A new query the validator accepts. Rejected and repeated inputs are free. */
    query: z.number().int().nonnegative(),
    /** A submission that fails a hidden test. */
    wrongSubmission: z.number().int().nonnegative(),
  }),
  levels: z
    .object({
      /**
       * Every level open from the start. When false, levels unlock in play
       * order, each by solving the one before (see `listLevels` in the API).
       */
      unlockAll: z.boolean(),
      /**
       * The top of the difficulty scale: `concept_diff` and `implement_diff`
       * in problem.yaml run from 1 to this, and so do the pips on the level select.
       */
      difficultyScale: z.number().int().min(1),
      /** A level of this difficulty or above is an extended level. */
      extendedDifficulty: z.number().int().min(1),
    })
    .refine((levels) => levels.extendedDifficulty <= levels.difficultyScale, {
      message: "extendedDifficulty must be within the difficulty scale",
    }),
});

const gameConfig = gameConfigSchema.parse(rawConfig);

/** What each action adds to a player's penalty. */
export const PENALTY_COSTS = gameConfig.penalty;
export type PenaltyCosts = typeof PENALTY_COSTS;

/** How levels open, how difficulty is scaled, and which levels count as extended. */
export const LEVEL_RULES = gameConfig.levels;

/** Difficulty runs from 1 to this. */
export const DIFFICULTY_SCALE = LEVEL_RULES.difficultyScale;

/** A difficulty on the game's scale, 1 to `DIFFICULTY_SCALE`. */
export const difficultySchema = z.number().int().min(1).max(DIFFICULTY_SCALE);

/** Whether a level of this difficulty is an extended level: one of the hardest. */
export function isExtended(difficulty: number): boolean {
  return difficulty >= LEVEL_RULES.extendedDifficulty;
}
