import { z } from "zod";

/**
 * While a level is open in a visible tab, the browser sends a heartbeat this
 * often, and the API adds this many seconds to the player's time on it.
 */
export const HEARTBEAT_SECONDS = 30;

/**
 * `POST /levels/:number/heartbeat`. `start` is sent when the level opens, or
 * its tab comes back into view: it starts the clock without adding time, so
 * a long absence is never counted.
 */
export const heartbeatRequestSchema = z.object({ start: z.boolean().default(false) });

/** Rows on one page of the scoreboard. */
export const SCOREBOARD_PAGE_SIZE = 10;

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
 * One row of the scoreboard: every player with at least one solve, ranked
 * like a programming contest. More machines solved ranks higher; on equal
 * solves, less total penalty does. Players equal on both share a rank, and
 * are listed by who reached that score first.
 */
const scoreboardRowSchema = z.object({
  rank: z.number().int().positive(),
  /** The player's alias. */
  name: z.string(),
  solved: z.number().int().positive(),
  penalty: z.number().int().nonnegative(),
  /** Every machine in play solved: the name is shown in gold. */
  complete: z.boolean(),
  /** An admin. Only admins see admins on the board; for anyone else, never true. */
  admin: z.boolean(),
  /** This row is the player asking. */
  you: z.boolean(),
});
export type ScoreboardRow = z.infer<typeof scoreboardRowSchema>;

/**
 * One row of the first solvers' board: every player who was the first to
 * solve at least one machine (its current version), admins left out. More
 * first solves ranks higher; players with as many share a rank, and are
 * listed by who made their earliest first solve first. Never longer than the
 * number of machines, since each has one first solver.
 */
const firstSolverRowSchema = z.object({
  rank: z.number().int().positive(),
  /** The player's alias. */
  name: z.string(),
  /** The machines they solved first, by number, in play order. */
  machines: z.array(z.number().int().positive()).min(1),
  /** This row is the player asking. */
  you: z.boolean(),
});
export type FirstSolverRow = z.infer<typeof firstSolverRowSchema>;

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
  /** Who has the most first solves. */
  firstSolvers: z.array(firstSolverRowSchema),
});
export type StatsResponse = z.infer<typeof statsResponseSchema>;

/** `GET /scoreboard?page=n`: which page, counting from 0. */
export const scoreboardQuerySchema = z.object({
  page: z.coerce.number().int().nonnegative().default(0),
});

/**
 * `GET /scoreboard`: one page of the scoreboard, `SCOREBOARD_PAGE_SIZE` rows
 * at most, and this player's own row wherever it falls, so it can be shown
 * above any page. Admins are left off, as from every global figure, except
 * when an admin asks: they see a board with every admin ranked in, so they
 * can find themselves. A page past the end is answered with the last one.
 */
export const scoreboardResponseSchema = z.object({
  rows: z.array(scoreboardRowSchema),
  /** The page these rows are, counting from 0. */
  page: z.number().int().nonnegative(),
  /** At least 1, even when the board is empty. */
  pageCount: z.number().int().positive(),
  /** How many players are on the whole scoreboard. */
  size: z.number().int().nonnegative(),
  /** This player's row, or null until they solve a machine. */
  you: scoreboardRowSchema.nullable(),
});
export type ScoreboardResponse = z.infer<typeof scoreboardResponseSchema>;

/** `GET /solvers?machine=n`: which machine, by its number in play order. */
export const solversQuerySchema = z.object({
  machine: z.coerce.number().int().positive(),
});

/** One player who solved the machine, with what it cost them and when. */
const solverRowSchema = z.object({
  /** The player's alias. */
  name: z.string(),
  /** Frozen at the solve, as everywhere. */
  penalty: z.number().int().nonnegative(),
  /** Time with the machine open until the solve; null when none was recorded. */
  seconds: z.number().int().nonnegative().nullable(),
  /** When they solved it (their first accepted submission), ISO 8601. */
  solvedAt: z.string(),
  /** An admin. Only admins see admins here; for anyone else, never true. */
  admin: z.boolean(),
  /** This row is the player asking. */
  you: z.boolean(),
});
export type SolverRow = z.infer<typeof solverRowSchema>;

/**
 * `GET /solvers`: everyone who has solved one machine's current version, in
 * the order they solved it. The browser sorts and pages it. Admins are left
 * out, except for an admin asking, as on the scoreboard.
 */
export const solversResponseSchema = levelRefSchema.extend({
  solvers: z.array(solverRowSchema),
});
export type SolversResponse = z.infer<typeof solversResponseSchema>;
