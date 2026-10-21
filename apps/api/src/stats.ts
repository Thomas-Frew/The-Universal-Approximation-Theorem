import { createHash, timingSafeEqual } from "node:crypto";
import { penaltyOf, type StatsResponse } from "@uat/shared";
import { asc, type Column, eq, notInArray } from "drizzle-orm";
import type { Database } from "./db/index.ts";
import { excludedPlayers, observations, playTime, submissions } from "./db/schema.ts";
import { GameError } from "./errors.ts";
import { tally } from "./game.ts";
import type { LoadedLevel } from "./levels.ts";

/**
 * The stats page. Everything is counted from rows with the same `tally` as
 * the level page, on each level's current version, and stops at the first
 * accepted submission, as penalty does. The one measured number is time,
 * from `play_time`.
 *
 * Global figures (means, who solved each machine first) leave out excluded
 * players, and are cached for a minute: they read every player's rows.
 */

/** How long global figures are reused before being counted again. */
const GLOBAL_CACHE_MS = 60_000;

type Rows = {
  entries: { userId: string; levelId: string; levelVersion: number; source: "query" | "revealed"; createdAt: Date }[];
  attempts: { id: number; userId: string; levelId: string; levelVersion: number; verdict: string; createdAt: Date }[];
  times: { userId: string; levelId: string; levelVersion: number; seconds: number }[];
};

/** One player's standing on one level. */
type LevelResult = {
  level: LoadedLevel;
  solved: boolean;
  penalty: number;
  queries: number;
  wrong: number;
  /** null when no time was recorded (e.g. play from before timing existed). */
  seconds: number | null;
};

const mean = (values: number[]) =>
  values.length === 0 ? null : values.reduce((sum, value) => sum + value, 0) / values.length;

/** Per player, per current level: what `tally` says, plus time. */
function resultsByPlayer(levels: readonly LoadedLevel[], rows: Rows): Map<string, LevelResult[]> {
  const isCurrent = new Map(levels.map((loaded) => [loaded.level.id, loaded.level.version]));
  const key = (row: { userId: string; levelId: string }) => `${row.userId}|${row.levelId}`;
  const group = <T extends { userId: string; levelId: string; levelVersion: number }>(list: T[]) => {
    const groups = new Map<string, T[]>();
    for (const row of list) {
      if (isCurrent.get(row.levelId) !== row.levelVersion) continue;
      groups.set(key(row), [...(groups.get(key(row)) ?? []), row]);
    }
    return groups;
  };
  const entries = group(rows.entries);
  const attempts = group(rows.attempts);
  const times = new Map(
    rows.times.filter((row) => isCurrent.get(row.levelId) === row.levelVersion).map((row) => [key(row), row.seconds]),
  );

  const players = new Set([...rows.entries, ...rows.attempts].map((row) => row.userId));
  const results = new Map<string, LevelResult[]>();
  for (const userId of players) {
    const mine: LevelResult[] = [];
    for (const level of levels) {
      const k = `${userId}|${level.level.id}`;
      if (!entries.has(k) && !attempts.has(k)) continue;
      const counts = tally(entries.get(k) ?? [], attempts.get(k) ?? []);
      mine.push({
        level,
        solved: counts.status === "solved",
        penalty: penaltyOf(counts),
        queries: counts.queries,
        wrong: counts.wrongSubmissions,
        seconds: times.get(k) ?? null,
      });
    }
    results.set(userId, mine);
  }
  return results;
}

/** accepted / (accepted + wrong), or null before any verdict. */
function acRate(results: LevelResult[]): number | null {
  const accepted = results.filter((result) => result.solved).length;
  const wrong = results.reduce((sum, result) => sum + result.wrong, 0);
  return accepted + wrong === 0 ? null : accepted / (accepted + wrong);
}

export function createStats({
  db,
  levels,
  excludeToken,
}: {
  db: Database;
  levels: readonly LoadedLevel[];
  /** STATS_EXCLUDE_TOKEN, or null when the exclude link is switched off. */
  excludeToken: string | null;
}) {
  /** Rows that counting needs (never inputs or code), for one player or for everyone not excluded. */
  async function loadRows(only: { userId: string } | "everyone"): Promise<Rows> {
    const notExcluded = (column: Column) =>
      notInArray(column, db.select({ id: excludedPlayers.userId }).from(excludedPlayers));
    const [entries, attempts, times] = await Promise.all([
      db
        .select({
          userId: observations.userId,
          levelId: observations.levelId,
          levelVersion: observations.levelVersion,
          source: observations.source,
          createdAt: observations.createdAt,
        })
        .from(observations)
        .where(only === "everyone" ? notExcluded(observations.userId) : eq(observations.userId, only.userId)),
      db
        .select({
          id: submissions.id,
          userId: submissions.userId,
          levelId: submissions.levelId,
          levelVersion: submissions.levelVersion,
          verdict: submissions.verdict,
          createdAt: submissions.createdAt,
        })
        .from(submissions)
        .where(only === "everyone" ? notExcluded(submissions.userId) : eq(submissions.userId, only.userId))
        // `tally` needs attempts in the order they were made.
        .orderBy(asc(submissions.id)),
      db
        .select({
          userId: playTime.userId,
          levelId: playTime.levelId,
          levelVersion: playTime.levelVersion,
          seconds: playTime.seconds,
        })
        .from(playTime)
        .where(only === "everyone" ? notExcluded(playTime.userId) : eq(playTime.userId, only.userId)),
    ]);
    return { entries, attempts, times };
  }

  type Global = {
    meanAcRate: number | null;
    /** For each level id, the mean penalty and time of those who solved it. */
    perLevel: Map<string, { meanPenalty: number | null; meanSeconds: number | null }>;
    /** For each level id, the player who solved its current version first. */
    firstSolver: Map<string, string>;
  };
  let cached: { at: number; value: Global } | null = null;

  async function global(): Promise<Global> {
    if (cached && Date.now() - cached.at < GLOBAL_CACHE_MS) return cached.value;
    const rows = await loadRows("everyone");
    const everyone = [...resultsByPlayer(levels, rows).values()];
    const solved = everyone.flat().filter((result) => result.solved);

    // First solver: the earliest accepted submission on each current version.
    // Rows come in id order, which is the order they were made.
    const firstSolver = new Map<string, string>();
    const isCurrent = new Map(levels.map((loaded) => [loaded.level.id, loaded.level.version]));
    for (const attempt of rows.attempts) {
      if (attempt.verdict !== "accepted" || isCurrent.get(attempt.levelId) !== attempt.levelVersion) continue;
      if (!firstSolver.has(attempt.levelId)) firstSolver.set(attempt.levelId, attempt.userId);
    }

    const value: Global = {
      meanAcRate: mean(everyone.map(acRate).filter((rate) => rate !== null)),
      perLevel: new Map(
        levels.map((loaded) => {
          const here = solved.filter((result) => result.level === loaded);
          return [
            loaded.level.id,
            {
              meanPenalty: mean(here.map((result) => result.penalty)),
              meanSeconds: mean(here.flatMap((result) => (result.seconds === null ? [] : [result.seconds]))),
            },
          ];
        }),
      ),
      firstSolver,
    };
    cached = { at: Date.now(), value };
    return value;
  }

  /** The stats page for one player. */
  async function getStats(userId: string): Promise<StatsResponse> {
    const [rows, everyone] = await Promise.all([loadRows({ userId }), global()]);
    const results = resultsByPlayer(levels, rows).get(userId) ?? [];
    const solved = results.filter((result) => result.solved);
    const ref = ({ level }: LevelResult) => ({ number: level.level.number, title: level.level.title });

    /** The level with the highest value, if any is above zero. */
    const most = (value: (result: LevelResult) => number) => {
      const best = results.reduce<LevelResult | null>(
        (top, result) => (top === null || value(result) > value(top) ? result : top),
        null,
      );
      return best && value(best) > 0 ? { ...ref(best), value: value(best) } : null;
    };

    return {
      totals: {
        penalty: results.reduce((sum, result) => sum + result.penalty, 0),
        accepted: solved.length,
        wrong: results.reduce((sum, result) => sum + result.wrong, 0),
        queries: results.reduce((sum, result) => sum + result.queries, 0),
        seconds: results.reduce((sum, result) => sum + (result.seconds ?? 0), 0),
        acRate: acRate(results),
        meanAcRate: everyone.meanAcRate,
      },
      most: {
        penalty: most((result) => result.penalty),
        queries: most((result) => result.queries),
        seconds: most((result) => result.seconds ?? 0),
      },
      firstSolves: solved.filter((result) => everyone.firstSolver.get(result.level.level.id) === userId).map(ref),
      flawless: solved.filter((result) => result.penalty === 0).map(ref),
      machines: levels.map((loaded) => {
        const mine = results.find((result) => result.level === loaded);
        return {
          number: loaded.level.number,
          title: loaded.level.title,
          ...(everyone.perLevel.get(loaded.level.id) ?? { meanPenalty: null, meanSeconds: null }),
          you: mine ? { solved: mine.solved, penalty: mine.penalty, seconds: mine.seconds } : null,
        };
      }),
    };
  }

  /**
   * Leaves this player out of every global figure, for good, if `token` is
   * STATS_EXCLUDE_TOKEN. Compared in constant time, so the response time says
   * nothing about how much of a guess was right.
   */
  async function exclude(userId: string, token: string): Promise<void> {
    const digest = (text: string) => createHash("sha256").update(text).digest();
    if (!excludeToken || !timingSafeEqual(digest(token), digest(excludeToken))) {
      throw new GameError(403, "That link is not valid.");
    }
    await db.insert(excludedPlayers).values({ userId }).onConflictDoNothing();
    cached = null;
  }

  return { getStats, exclude };
}
