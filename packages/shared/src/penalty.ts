import { PENALTY_COSTS, type PenaltyCosts } from "./config.ts";

/** The two things that are counted. Penalty is always worked out from these, never stored. */
export type PenaltyCounters = { queries: number; wrongSubmissions: number };

export function penaltyOf(
  { queries, wrongSubmissions }: PenaltyCounters,
  costs: PenaltyCosts = PENALTY_COSTS,
): number {
  return queries * costs.query + wrongSubmissions * costs.wrongSubmission;
}
