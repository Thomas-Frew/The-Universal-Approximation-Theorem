import { z } from "zod";
import rawConfig from "../game.config.json" with { type: "json" };

/**
 * `game.config.json`: the rules of the game that are numbers. A committed file
 * and not environment variables, because the web app and the API are deployed
 * separately and must agree on them.
 */
const gameConfigSchema = z.object({
  penalty: z.object({
    /** A new query the validator accepts. Rejected and repeated inputs are free. */
    query: z.number().int().nonnegative(),
    /** A submission that fails a hidden test. */
    wrongSubmission: z.number().int().nonnegative(),
  }),
});

/** What each action adds to a player's penalty. */
export const PENALTY_COSTS = gameConfigSchema.parse(rawConfig).penalty;
export type PenaltyCosts = typeof PENALTY_COSTS;

/** The two things that are counted. Penalty is always worked out from these, never stored. */
export type PenaltyCounters = { queries: number; wrongSubmissions: number };

export function penaltyOf(
  { queries, wrongSubmissions }: PenaltyCounters,
  costs: PenaltyCosts = PENALTY_COSTS,
): number {
  return queries * costs.query + wrongSubmissions * costs.wrongSubmission;
}
