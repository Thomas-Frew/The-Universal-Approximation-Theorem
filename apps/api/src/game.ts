import { createHash } from "node:crypto";
import {
  type Level,
  type LogEntry,
  MAX_RUN_OBSERVATIONS,
  normaliseInput,
  type Progress,
  type QueryResult,
  type RunResult,
  type SubmissionRequest,
  type SubmissionResult,
} from "@uat/shared";
import { and, asc, count, eq } from "drizzle-orm";
import type { Database } from "./db/index.ts";
import { machineAnswers, observations, submissions } from "./db/schema.ts";
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
    table: typeof observations | typeof submissions,
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
        .select({ verdict: submissions.verdict, createdAt: submissions.createdAt })
        .from(submissions)
        .where(mine(submissions, userId, level))
        .orderBy(asc(submissions.id)),
    ]);

    // Penalty stops growing at the first accepted submission.
    const solvedAt = attempts.find((attempt) => attempt.verdict === "accepted")?.createdAt;
    const counts = (createdAt: Date) => !solvedAt || createdAt < solvedAt;

    return {
      status: solvedAt
        ? "solved"
        : entries.length > 0 || attempts.length > 0
          ? "in_progress"
          : "new",
      // The answer, in words: the reward for solving, so never sent before.
      ...(solvedAt && { solution: find(level).solution }),
      log: entries.map(({ input, output, source }) => ({ input, output, source })),
      queries: entries.filter((entry) => entry.source === "query" && counts(entry.createdAt))
        .length,
      wrongSubmissions: attempts.filter(
        (attempt) => WRONG_VERDICTS.has(attempt.verdict) && counts(attempt.createdAt),
      ).length,
    };
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
  async function resetProgress(userId: string, level: Level): Promise<Progress> {
    await db.transaction(async (tx) => {
      await tx.delete(observations).where(mine(observations, userId, level));
      await tx.delete(submissions).where(mine(submissions, userId, level));
    });
    return getProgress(userId, level);
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

  return { getProgress, query, submit, run, resetProgress, releaseStuckSubmissions };
}

export type Game = ReturnType<typeof createGame>;
