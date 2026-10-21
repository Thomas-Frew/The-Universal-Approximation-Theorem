import { createHash } from "node:crypto";
import {
  HEARTBEAT_SECONDS,
  type Level,
  LEVEL_RULES,
  type LevelSummary,
  type LogEntry,
  MAX_RUN_OBSERVATIONS,
  normaliseInput,
  type Progress,
  type QueryResult,
  type RunResult,
  type SubmissionRequest,
  type SubmissionResult,
} from "@uat/shared";
import { and, asc, count, countDistinct, eq, sql } from "drizzle-orm";
import type { Database } from "./db/index.ts";
import { machineAnswers, observations, playTime, submissions } from "./db/schema.ts";
import { GameError } from "./errors.ts";
import { createGate } from "./gate.ts";
import type { Judge } from "./judge.ts";
import type { LoadedLevel } from "./levels.ts";
import { askMachine } from "./query.ts";

/**
 * The game's rules on top of the database: what a query, a submission and a
 * Run do for a player, and where that leaves them.
 *
 * Nothing is counted in a column. A player's queries, wrong submissions and
 * solved state are worked out from their `observations` and `submissions` rows
 * for the level's current version, every time. That is what makes a new
 * version start afresh, and solving freeze the penalty, without any resetting.
 */

const WRONG_VERDICTS = new Set(["wrong_answer", "runtime_error", "time_limit"]);

/**
 * Where a player stands on one version of a level, from their rows for it:
 * the one place progress is counted, shared by the level page and the level
 * select so the two always agree. Attempts must be in the order they were made.
 * Penalty stops growing at the first accepted submission.
 */
export function tally(
  entries: readonly { source: "query" | "revealed"; createdAt: Date }[],
  attempts: readonly { verdict: string; createdAt: Date }[],
): Pick<Progress, "status" | "queries" | "wrongSubmissions"> {
  const solvedAt = attempts.find((attempt) => attempt.verdict === "accepted")?.createdAt;
  const counts = (createdAt: Date) => !solvedAt || createdAt < solvedAt;
  return {
    status: solvedAt
      ? "solved"
      : entries.length > 0 || attempts.length > 0
        ? "in_progress"
        : "new",
    queries: entries.filter((entry) => entry.source === "query" && counts(entry.createdAt)).length,
    wrongSubmissions: attempts.filter(
      (attempt) => WRONG_VERDICTS.has(attempt.verdict) && counts(attempt.createdAt),
    ).length,
  };
}

// Limits against abuse, not game rules: a real player should never meet one.

/**
 * Validator and machine processes running at once (each query that misses the
 * answer cache starts one, then the other). They take milliseconds, so this is
 * plenty for real play while stopping a flood of fresh inputs from forking the
 * droplet to a standstill.
 */
const MAX_MACHINE_PROCESSES = 8;

/**
 * Judge0 jobs (submissions and Runs) this API has in flight at once. Judge0
 * queues at most 100 in all, and the demo and the live game share it, so each
 * keeps well under half.
 */
const MAX_JUDGE_JOBS = 10;

/**
 * Queries one player may make on one version of a level. Every row a player
 * can add to the shared `machine_answers` cache arrives with a query row of
 * their own, so this also bounds how much of the cache one session can grow.
 * Two queries at the very same moment can both pass the check: the cap is
 * approximate, which is all it needs to be.
 */
const MAX_QUERIES_PER_LEVEL = 500;

/** Matches inputs in the database. Inputs can be too long to index directly. */
const hashInput = (input: string) => createHash("sha256").update(input).digest("hex");

/** Two Postgres errors we expect, by their SQLSTATE codes. */
function isUniqueViolation(error: unknown): boolean {
  // Drizzle wraps the driver's error, so look down the `cause` chain.
  for (let current = error; current; current = (current as { cause?: unknown }).cause) {
    if ((current as { code?: unknown }).code === "23505") return true;
  }
  return false;
}

export function createGame({
  db,
  levels,
  judge,
  debug,
}: {
  db: Database;
  levels: readonly LoadedLevel[];
  judge: Judge | null;
  debug: boolean;
}) {
  const byId = new Map(levels.map((loaded) => [loaded.level.id, loaded]));
  const find = (level: Level) => {
    const loaded = byId.get(level.id);
    if (!loaded) throw new Error(`Level ${level.id} is not loaded`);
    return loaded;
  };

  const throughMachines = createGate(
    MAX_MACHINE_PROCESSES,
    () => new GameError(503, "The machine is busy. Try again in a moment."),
  );
  const throughJudge = createGate(
    MAX_JUDGE_JOBS,
    () => new GameError(503, "The judge is busy. Try again in a moment."),
  );

  /** Rows for this player on this level's current version. */
  const mine = (
    table: typeof observations | typeof submissions | typeof playTime,
    userId: string,
    level: Level,
  ) =>
    and(
      eq(table.userId, userId),
      eq(table.levelId, level.id),
      eq(table.levelVersion, level.version),
    );

  async function getProgress(userId: string, level: Level): Promise<Progress> {
    const [entries, attempts] = await Promise.all([
      db
        .select({
          input: observations.input,
          output: observations.output,
          source: observations.source,
          createdAt: observations.createdAt,
        })
        .from(observations)
        .where(mine(observations, userId, level))
        .orderBy(asc(observations.id)),
      db
        .select({
          verdict: submissions.verdict,
          createdAt: submissions.createdAt,
          language: submissions.language,
          code: submissions.code,
        })
        .from(submissions)
        .where(mine(submissions, userId, level))
        .orderBy(asc(submissions.id)),
    ]);
    const { status, queries, wrongSubmissions } = tally(entries, attempts);
    // The most recent accepted submission: after solving, a player may solve it
    // again, and the code view shows their latest. (The penalty still freezes
    // at the first, in `tally`.)
    const accepted = [...attempts].reverse().find((attempt) => attempt.verdict === "accepted");
    return {
      status,
      // The answer, in words: the reward for solving, so never sent before.
      ...(status === "solved" && { solution: find(level).solution }),
      // Their own code that last solved it, to read back from the completion panel.
      ...(accepted && { solvedWith: { language: accepted.language, code: accepted.code } }),
      log: entries.map(({ input, output, source }) => ({ input, output, source })),
      queries,
      wrongSubmissions,
    };
  }

  /**
   * Every level in play order with where this player stands, for the level
   * select. Two queries for all levels, not two per level: only the columns
   * that counting needs, never the inputs or code.
   *
   * With `unlockAll` in game.config.json, every level is open. Otherwise a
   * level is open if it is the first, if the level before it has been
   * solved (any version), or if the player has already played it (any
   * version). The last rule means inserting or reordering levels never locks
   * a player out of one they had reached.
   */
  async function listLevels(userId: string): Promise<LevelSummary[]> {
    const [entries, attempts, solveCounts] = await Promise.all([
      db
        .select({
          levelId: observations.levelId,
          levelVersion: observations.levelVersion,
          source: observations.source,
          createdAt: observations.createdAt,
        })
        .from(observations)
        .where(eq(observations.userId, userId)),
      db
        .select({
          levelId: submissions.levelId,
          levelVersion: submissions.levelVersion,
          verdict: submissions.verdict,
          createdAt: submissions.createdAt,
        })
        .from(submissions)
        .where(eq(submissions.userId, userId))
        .orderBy(asc(submissions.id)),
      // Every player's solves, per level and version: one row per pair, not per player.
      db
        .select({
          levelId: submissions.levelId,
          levelVersion: submissions.levelVersion,
          solves: countDistinct(submissions.userId),
        })
        .from(submissions)
        .where(eq(submissions.verdict, "accepted"))
        .groupBy(submissions.levelId, submissions.levelVersion),
    ]);

    const solvedEver = new Set(
      attempts.filter((attempt) => attempt.verdict === "accepted").map((attempt) => attempt.levelId),
    );
    const playedEver = new Set([...entries, ...attempts].map((row) => row.levelId));

    return levels.map(({ level, difficulty }, index) => {
      const previous = levels[index - 1];
      const open =
        LEVEL_RULES.unlockAll ||
        !previous ||
        solvedEver.has(previous.level.id) ||
        playedEver.has(level.id);
      const current = <T extends { levelId: string; levelVersion: number }>(row: T) =>
        row.levelId === level.id && row.levelVersion === level.version;
      const counts = tally(entries.filter(current), attempts.filter(current));
      return {
        number: level.number,
        title: level.title,
        difficulty,
        solves:
          solveCounts.find((row) => row.levelId === level.id && row.levelVersion === level.version)
            ?.solves ?? 0,
        ...(open ? counts : { status: "locked", queries: 0, wrongSubmissions: 0 }),
      };
    });
  }

  /** Whether this player may open, query and submit to this level. */
  async function isUnlocked(userId: string, level: Level): Promise<boolean> {
    const summary = (await listLevels(userId)).find((entry) => entry.number === level.number);
    return summary !== undefined && summary.status !== "locked";
  }

  /** The machine's answer, from the shared cache if anyone has asked before. */
  async function answerFor(loaded: LoadedLevel, input: string, inputHash: string) {
    const { level } = loaded;
    const [cached] = await db
      .select({ output: machineAnswers.output })
      .from(machineAnswers)
      .where(
        and(
          eq(machineAnswers.levelId, level.id),
          eq(machineAnswers.levelVersion, level.version),
          eq(machineAnswers.inputHash, inputHash),
        ),
      );
    // Only inputs the validator accepted are ever cached, so no need to validate again.
    if (cached) return { status: "ok", input, output: cached.output } satisfies QueryResult;

    const result = await throughMachines(() => askMachine(loaded, input, { debug }));
    if (result.status === "ok") {
      await db
        .insert(machineAnswers)
        .values({ levelId: level.id, levelVersion: level.version, inputHash, input, output: result.output })
        .onConflictDoNothing();
    }
    return result;
  }

  async function query(userId: string, level: Level, rawInput: string) {
    const loaded = find(level);
    const input = normaliseInput(rawInput);
    const inputHash = hashInput(input);

    const [made] = await db
      .select({ queries: count() })
      .from(observations)
      .where(and(mine(observations, userId, level), eq(observations.source, "query")));
    if ((made?.queries ?? 0) >= MAX_QUERIES_PER_LEVEL) {
      throw new GameError(429, `That is the limit of ${MAX_QUERIES_PER_LEVEL} queries on this machine.`);
    }

    const result = await answerFor(loaded, input, inputHash);
    if (result.status === "ok") {
      // A repeat hits the unique index and inserts nothing, so it is never
      // counted. That holds even for two identical queries at the same moment.
      await db
        .insert(observations)
        .values({
          userId,
          levelId: level.id,
          levelVersion: level.version,
          input,
          inputHash,
          output: result.output,
          source: "query",
        })
        .onConflictDoNothing();
    }
    return { result, progress: await getProgress(userId, level) };
  }

  async function submit(userId: string, level: Level, submission: SubmissionRequest) {
    if (!judge) throw new GameError(503, "The judge is not connected.");
    // Through the gate before the pending row exists, so a turned-away
    // submission leaves no trace and costs nothing.
    return throughJudge(() => judgeSubmission(judge, userId, level, submission));
  }

  async function judgeSubmission(
    judge: Judge,
    userId: string,
    level: Level,
    submission: SubmissionRequest,
  ) {

    // The pending row goes in first. The database allows one pending row per
    // player, so a second submission while one is judged fails right here.
    let submissionId: number;
    try {
      const [row] = await db
        .insert(submissions)
        .values({ userId, levelId: level.id, levelVersion: level.version, ...submission })
        .returning({ id: submissions.id });
      if (!row) throw new Error("Insert returned no row");
      submissionId = row.id;
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new GameError(409, "A submission is already being judged.");
      }
      throw error;
    }
    const byThisId = eq(submissions.id, submissionId);

    let verdict: SubmissionResult;
    try {
      verdict = await judge.submit(level, submission);
    } catch (error) {
      // No verdict was reached: record that, charge nothing, tell the player.
      console.error(error);
      await db
        .update(submissions)
        .set({ verdict: "judge_error", judgedAt: new Date() })
        .where(byThisId);
      throw new GameError(503, "The judge could not be reached.");
    }

    // The verdict and the revealed case are written together, or not at all.
    await db.transaction(async (tx) => {
      await tx
        .update(submissions)
        .set({ verdict: verdict.status, judgedAt: new Date() })
        .where(byThisId);
      if ("revealed" in verdict) {
        const { input, output } = verdict.revealed;
        await tx
          .insert(observations)
          .values({
            userId,
            levelId: level.id,
            levelVersion: level.version,
            input,
            inputHash: hashInput(input),
            output,
            source: "revealed",
          })
          .onConflictDoNothing();
      }
    });

    return { verdict, progress: await getProgress(userId, level) };
  }

  async function run(userId: string, level: Level, submission: SubmissionRequest): Promise<RunResult> {
    if (!judge) throw new GameError(503, "The judge is not connected.");
    // The log as the server has it, not as the browser says it is.
    const { log } = await getProgress(userId, level);
    const all = [...level.samples, ...log.map(({ input, output }: LogEntry) => ({ input, output }))];
    try {
      return await throughJudge(() =>
        judge.run(level, submission, all.slice(0, MAX_RUN_OBSERVATIONS)),
      );
    } catch (error) {
      if (error instanceof GameError) throw error;
      console.error(error);
      throw new GameError(503, "The judge could not be reached.");
    }
  }

  /**
   * Deletes this player's observations and submissions on the level's current
   * version, so they start it afresh. Only the demo offers this (see app.ts):
   * in the full game it would let a player erase a bad penalty.
   */
  /**
   * Deletes everything this player has done, on every level and version: the
   * settings menu's "Wipe progress". Their account (the anonymous user and its
   * session) stays, so they simply start the game again. Refused while a
   * submission is being judged, whose verdict would otherwise land on a log
   * that no longer exists.
   */
  async function wipeProgress(userId: string): Promise<void> {
    await db.transaction(async (tx) => {
      const [judging] = await tx
        .select({ id: submissions.id })
        .from(submissions)
        .where(and(eq(submissions.userId, userId), eq(submissions.verdict, "pending")))
        .limit(1);
      if (judging) {
        throw new GameError(409, "Wait for your submission to be judged first.");
      }
      await tx.delete(observations).where(eq(observations.userId, userId));
      await tx.delete(submissions).where(eq(submissions.userId, userId));
      await tx.delete(playTime).where(eq(playTime.userId, userId));
    });
  }

  async function resetProgress(userId: string, level: Level): Promise<Progress> {
    await db.transaction(async (tx) => {
      await tx.delete(observations).where(mine(observations, userId, level));
      await tx.delete(submissions).where(mine(submissions, userId, level));
      await tx.delete(playTime).where(mine(playTime, userId, level));
    });
    return getProgress(userId, level);
  }

  /**
   * The browser's "still here" while a level is open in a visible tab: adds
   * HEARTBEAT_SECONDS to the player's time on it. Time freezes on solving,
   * like penalty, so a solved level gets nothing. A beat less than 25 seconds
   * after the last adds nothing either, so a second tab, or a script, cannot
   * make time run faster than the clock.
   */
  async function heartbeat(userId: string, level: Level): Promise<void> {
    const [solved] = await db
      .select({ id: submissions.id })
      .from(submissions)
      .where(and(mine(submissions, userId, level), eq(submissions.verdict, "accepted")))
      .limit(1);
    if (solved) return;
    await db
      .insert(playTime)
      .values({ userId, levelId: level.id, levelVersion: level.version, seconds: HEARTBEAT_SECONDS })
      .onConflictDoUpdate({
        target: [playTime.userId, playTime.levelId, playTime.levelVersion],
        set: { seconds: sql`${playTime.seconds} + ${HEARTBEAT_SECONDS}`, updatedAt: sql`now()` },
        setWhere: sql`${playTime.updatedAt} < now() - interval '25 seconds'`,
      });
  }

  /**
   * A submission left `pending` means the API stopped while judging it. Without
   * this, the one-pending rule would block that player for good.
   */
  async function releaseStuckSubmissions(): Promise<number> {
    const released = await db
      .update(submissions)
      .set({ verdict: "judge_error", judgedAt: new Date() })
      .where(eq(submissions.verdict, "pending"))
      .returning({ id: submissions.id });
    return released.length;
  }

  return {
    getProgress,
    listLevels,
    isUnlocked,
    query,
    submit,
    run,
    resetProgress,
    wipeProgress,
    heartbeat,
    releaseStuckSubmissions,
  };
}

export type Game = ReturnType<typeof createGame>;
