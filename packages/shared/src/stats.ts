import { z } from "zod";

/**
 * While a level is open in a visible tab, the browser sends a heartbeat this
 * often, and the API adds this many seconds to the player's time on it.
 */
export const HEARTBEAT_SECONDS = 30;

/** A level, as a stats entry names it. */
const levelRefSchema = z.object({
  number: z.number().int().positive(),
  title: z.string(),
});

/** The level with the highest value of something, and that value. */
const recordSchema = levelRefSchema.extend({ value: z.number().nonnegative() }).nullable();

/**
 * One machine on the per-machine charts: everyone's average (over the players
 * who solved it), and this player's own figures if they have played it.
 */
const machineStatSchema = levelRefSchema.extend({
  /** Mean penalty of those who solved it, or null if nobody has. */
  meanPenalty: z.number().nonnegative().nullable(),
  /** Mean seconds to solve it, or null if nobody with timing has. */
  meanSeconds: z.number().nonnegative().nullable(),
  /** This player's standing, or null if they have not started it. */
  you: z
    .object({
      solved: z.boolean(),
      /** So far, if not solved; final, if solved. */
      penalty: z.number().int().nonnegative(),
      /** null when no time was recorded. */
      seconds: z.number().int().nonnegative().nullable(),
    })
    .nullable(),
});

/**
 * `GET /stats`: the player's statistics over every level's current version.
 * Like penalty, everything stops at a level's first accepted submission:
 * queries, wrong answers and time after solving are not counted.
 *
 * "Mean" figures are over every player except those excluded from global
 * stats (admins: the author and testers), and `null` until there is anyone to average.
 */
export const statsResponseSchema = z.object({
  totals: z.object({
    penalty: z.number().int().nonnegative(),
    /** Machines solved. */
    accepted: z.number().int().nonnegative(),
    /** Wrong submissions before solving (wrong answer, runtime error, time limit). */
    wrong: z.number().int().nonnegative(),
    queries: z.number().int().nonnegative(),
    seconds: z.number().int().nonnegative(),
    /** accepted / (accepted + wrong), or null before any verdict. */
    acRate: z.number().min(0).max(1).nullable(),
    /** The mean of every player's AC rate. */
    meanAcRate: z.number().min(0).max(1).nullable(),
  }),
  most: z.object({
    penalty: recordSchema,
    queries: recordSchema,
    seconds: recordSchema,
  }),
  /** Machines this player solved before any other player. */
  firstSolves: z.array(levelRefSchema),
  /** Machines solved with no penalty at all. */
  flawless: z.array(levelRefSchema),
  /** Every machine in play order, with everyone's averages and where this player is. */
  machines: z.array(machineStatSchema),
});
export type StatsResponse = z.infer<typeof statsResponseSchema>;
