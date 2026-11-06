import {
  type FirstSolverRow,
  penaltyOf,
  SCOREBOARD_PAGE_SIZE,
  type ScoreboardResponse,
  type ScoreboardRow,
  type SolverRow,
  type SolversResponse,
  type StatsResponse,
} from "@uat/shared";
import { asc, type Column, eq, inArray, notInArray } from "drizzle-orm";
import type { Database } from "./db/index.ts";
import { excludedPlayers, observations, playTime, submissions } from "./db/schema.ts";
import { GameError } from "./errors.ts";
import { tally } from "./game.ts";
import type { LoadedLevel } from "./levels.ts";
import { tagOf } from "./playerTag.ts";

/**
 * The stats page. Everything is counted from rows with the same `tally` as
 * the level page, on each level's current version, and stops at the first
 * accepted submission, as penalty does. The one measured number is time,
 * from `play_time`.
 *
 * Global figures (means, who solved each machine first, the scoreboard)
 * leave out excluded players (admins: see admin.ts), and are cached for a
 * minute: they read every player's rows.
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

/** A scoreboard row before it is shown to anyone: who it is, for marking "you". */
type BoardEntry = Omit<ScoreboardRow, "you"> & { userId: string };

/**
 * When each player last solved a machine for the first time: the
 * scoreboard's tie-break. The first accepted attempt per player and level is
 * the solve; later ones are replays. `attempts` must be in the order made.
 */
function reachedAtOf(attempts: Rows["attempts"], isCurrent: Map<string, number>): Map<string, number> {
  const solvedOnce = new Set<string>();
  const reachedAt = new Map<string, number>();
  for (const attempt of attempts) {
    if (attempt.verdict !== "accepted" || isCurrent.get(attempt.levelId) !== attempt.levelVersion) continue;
    const solve = `${attempt.userId}|${attempt.levelId}`;
    if (solvedOnce.has(solve)) continue;
    solvedOnce.add(solve);
    reachedAt.set(attempt.userId, Math.max(reachedAt.get(attempt.userId) ?? 0, attempt.createdAt.getTime()));
  }
  return reachedAt;
}

/** A row of a machine's solvers before it is shown to anyone: who it is, for marking "you". */
type SolverEntry = Omit<SolverRow, "you"> & { userId: string };

/**
 * Everyone who solved each machine, by level id, in the order they solved it:
 * their penalty and time there (both frozen at the solve, as everywhere), and
 * when, from their first accepted attempt. `attempts` must be in the order made.
 */
function solversByLevel(
  results: Map<string, LevelResult[]>,
  attempts: Rows["attempts"],
  isCurrent: Map<string, number>,
  aliases: Map<string, string>,
  admins: Set<string>,
): Map<string, SolverEntry[]> {
  const solvedAt = new Map<string, Date>();
  for (const attempt of attempts) {
    if (attempt.verdict !== "accepted" || isCurrent.get(attempt.levelId) !== attempt.levelVersion) continue;
    const solve = `${attempt.userId}|${attempt.levelId}`;
    if (!solvedAt.has(solve)) solvedAt.set(solve, attempt.createdAt);
  }
  const byLevel = new Map<string, SolverEntry[]>();
  for (const [userId, mine] of results) {
    for (const result of mine) {
      const at = solvedAt.get(`${userId}|${result.level.level.id}`);
      if (!result.solved || !at) continue;
      const list = byLevel.get(result.level.level.id) ?? [];
      list.push({
        userId,
        name: aliases.get(userId) ?? tagOf(userId),
        penalty: result.penalty,
        seconds: result.seconds,
        solvedAt: at.toISOString(),
        admin: admins.has(userId),
      });
      byLevel.set(result.level.level.id, list);
    }
  }
  // ISO 8601 times in UTC sort as text.
  for (const list of byLevel.values()) list.sort((a, b) => a.solvedAt.localeCompare(b.solvedAt));
  return byLevel;
}

/**
 * The first solvers' board: each player who solved some machine first, with
 * those machines, ranked by how many. Players with as many share a rank and
 * are listed by who made their earliest first solve first (`earliestFirst`
 * holds that attempt's id, and ids grow with time).
 */
function rankFirstSolvers(
  levels: readonly LoadedLevel[],
  firstSolver: Map<string, string>,
  earliestFirst: Map<string, number>,
  aliases: Map<string, string>,
): (FirstSolverRow & { userId: string })[] {
  const machinesOf = new Map<string, number[]>();
  for (const { level } of levels) {
    const who = firstSolver.get(level.id);
    if (who) machinesOf.set(who, [...(machinesOf.get(who) ?? []), level.number]);
  }
  const sorted = [...machinesOf].sort(
    ([a, aMachines], [b, bMachines]) =>
      bMachines.length - aMachines.length || (earliestFirst.get(a) ?? 0) - (earliestFirst.get(b) ?? 0),
  );
  let rank = 0;
  return sorted.map(([userId, machines], index) => {
    // A new rank only where the count drops; ties keep the rank above.
    if (index === 0 || machines.length !== sorted[index - 1]![1].length) rank = index + 1;
    return { userId, rank, name: aliases.get(userId) ?? tagOf(userId), machines, you: false };
  });
}

/**
 * Everyone with at least one solve, ranked as in a programming contest: most
 * machines solved first, then least penalty, then least time played on them.
 * Penalty and time count solved machines only (a machine still being worked
 * on costs nothing here), and time is never shown on the board: it only
 * breaks ties. Equal on all three, players share a rank (1, 2, 2, 4) and are
 * listed by who reached that score first: the time of their last
 * first-solve. A player who has solved all `levelCount` machines is
 * `complete`.
 */
function rankBoard(
  results: Map<string, LevelResult[]>,
  reachedAt: Map<string, number>,
  aliases: Map<string, string>,
  { levelCount, admins }: { levelCount: number; admins: Set<string> },
): BoardEntry[] {
  const scored = [...results].flatMap(([userId, mine]) => {
    const solved = mine.filter((result) => result.solved);
    if (solved.length === 0) return [];
    return [{
      userId,
      solved: solved.length,
      penalty: solved.reduce((sum, result) => sum + result.penalty, 0),
      seconds: solved.reduce((sum, result) => sum + (result.seconds ?? 0), 0),
      reached: reachedAt.get(userId) ?? 0,
    }];
  });
  scored.sort((a, b) => b.solved - a.solved || a.penalty - b.penalty || a.seconds - b.seconds || a.reached - b.reached);
  const board: BoardEntry[] = [];
  for (const [index, entry] of scored.entries()) {
    const previous = board[index - 1];
    const before = scored[index - 1];
    // Competition ranking: a tie shares the rank of the first in its group.
    const tied =
      previous !== undefined &&
      before !== undefined &&
      before.solved === entry.solved &&
      before.penalty === entry.penalty &&
      before.seconds === entry.seconds;
    board.push({
      userId: entry.userId,
      rank: tied ? previous.rank : index + 1,
      // Everyone has an alias (`aliasesOf` makes one if need be); the tag is
      // only a fallback should a profile be missing all the same.
      name: aliases.get(entry.userId) ?? tagOf(entry.userId),
      solved: entry.solved,
      penalty: entry.penalty,
      complete: entry.solved === levelCount,
      admin: admins.has(entry.userId),
    });
  }
  return board;
}

export function createStats({ db, levels, aliasesOf }: {
  db: Database;
  levels: readonly LoadedLevel[];
  /** Players' aliases, from `profiles.ts`, which makes one for any player without. */
  aliasesOf: (userIds: string[]) => Promise<Map<string, string>>;
}) {
  /**
   * Rows that counting needs (never inputs or code): for one player, for
   * everyone not excluded, or for the excluded alone (the admins).
   */
  async function loadRows(only: { userId: string } | "everyone" | "admins"): Promise<Rows> {
    const excluded = db.select({ id: excludedPlayers.userId }).from(excludedPlayers);
    const whose = (column: Column) =>
      only === "everyone"
        ? notInArray(column, excluded)
        : only === "admins"
          ? inArray(column, excluded)
          : eq(column, only.userId);
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
        .where(whose(observations.userId)),
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
        .where(whose(submissions.userId))
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
        .where(whose(playTime.userId)),
    ]);
    return { entries, attempts, times };
  }

  type Global = {
    meanAcRate: number | null;
    /** For each level id, the mean penalty and time of those who solved it. */
    perLevel: Map<string, { meanPenalty: number | null; meanSeconds: number | null }>;
    /** For each level id, the player who solved its current version first. */
    firstSolver: Map<string, string>;
    /** The first solvers' board, ranked, still with ids so each player can find their own row. */
    firstSolvers: (FirstSolverRow & { userId: string })[];
    /** Every player with a solve, ranked. */
    board: BoardEntry[];
    /** The same with the admins ranked in too: the board admins see. */
    boardWithAdmins: BoardEntry[];
    /** For each level id, everyone who solved it, admins included and marked. */
    solvers: Map<string, SolverEntry[]>;
    admins: Set<string>;
  };
  let cached: { at: number; value: Global } | null = null;

  async function global(): Promise<Global> {
    if (cached && Date.now() - cached.at < GLOBAL_CACHE_MS) return cached.value;
    const [rows, adminRows, adminList] = await Promise.all([
      loadRows("everyone"),
      loadRows("admins"),
      db.select({ id: excludedPlayers.userId }).from(excludedPlayers),
    ]);
    const admins = new Set(adminList.map((admin) => admin.id));
    const byPlayer = resultsByPlayer(levels, rows);
    const everyone = [...byPlayer.values()];
    const solved = everyone.flat().filter((result) => result.solved);

    // First solver: the earliest accepted submission on each current version.
    // Rows come in id order, which is the order they were made.
    const firstSolver = new Map<string, string>();
    /** When each first solver made the first of their first solves, for breaking ties. */
    const earliestFirst = new Map<string, number>();
    const isCurrent = new Map(levels.map((loaded) => [loaded.level.id, loaded.level.version]));
    for (const attempt of rows.attempts) {
      if (attempt.verdict !== "accepted" || isCurrent.get(attempt.levelId) !== attempt.levelVersion) continue;
      if (firstSolver.has(attempt.levelId)) continue;
      firstSolver.set(attempt.levelId, attempt.userId);
      if (!earliestFirst.has(attempt.userId)) earliestFirst.set(attempt.userId, attempt.id);
    }

    // The admins' board: everyone's rows and the admins', merged, with
    // attempts back in the order they were made.
    const allRows: Rows = {
      entries: [...rows.entries, ...adminRows.entries],
      attempts: [...rows.attempts, ...adminRows.attempts].sort((a, b) => a.id - b.id),
      times: [...rows.times, ...adminRows.times],
    };
    const reachedAt = reachedAtOf(rows.attempts, isCurrent);
    const reachedAtWithAdmins = reachedAtOf(allRows.attempts, isCurrent);
    const aliases = await aliasesOf([...reachedAtWithAdmins.keys()]);
    const ranking = { levelCount: levels.length, admins };
    const resultsWithAdmins = resultsByPlayer(levels, allRows);

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
      firstSolvers: rankFirstSolvers(levels, firstSolver, earliestFirst, aliases),
      board: rankBoard(byPlayer, reachedAt, aliases, ranking),
      boardWithAdmins: rankBoard(resultsWithAdmins, reachedAtWithAdmins, aliases, ranking),
      solvers: solversByLevel(resultsWithAdmins, allRows.attempts, isCurrent, aliases, admins),
      admins,
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
      firstSolvers: everyone.firstSolvers.map(({ userId: who, ...row }) => ({ ...row, you: who === userId })),
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
   * One page of the scoreboard, from the same cached ranking as the rest of
   * the global figures, so turning pages counts nothing again. Never anyone's
   * id: only names, which are aliases or tags.
   */
  async function getScoreboard(userId: string, page: number): Promise<ScoreboardResponse> {
    const everyone = await global();
    // Admins are left off the board, so an admin sees the one with them in.
    const board = everyone.admins.has(userId) ? everyone.boardWithAdmins : everyone.board;
    const pageCount = Math.max(1, Math.ceil(board.length / SCOREBOARD_PAGE_SIZE));
    // Past the end (the board shrank, or a hand-typed page): the last page.
    const shown = Math.min(page, pageCount - 1);
    const show = ({ userId: who, ...row }: BoardEntry) => ({ ...row, you: who === userId });
    const yours = board.find((entry) => entry.userId === userId);
    return {
      rows: board.slice(shown * SCOREBOARD_PAGE_SIZE, (shown + 1) * SCOREBOARD_PAGE_SIZE).map(show),
      page: shown,
      pageCount,
      size: board.length,
      you: yours ? show(yours) : null,
    };
  }

  /**
   * Everyone who solved one machine, from the cached figures. Never anyone's
   * id. Admins are left out unless an admin asks, as on the scoreboard.
   */
  async function getSolvers(userId: string, number: number): Promise<SolversResponse> {
    const loaded = levels.find((candidate) => candidate.level.number === number);
    if (!loaded) throw new GameError(404, "There is no such machine.");
    const everyone = await global();
    const all = everyone.solvers.get(loaded.level.id) ?? [];
    const shown = everyone.admins.has(userId) ? all : all.filter((entry) => !entry.admin);
    return {
      number,
      title: loaded.level.title,
      solvers: shown.map(({ userId: who, ...row }) => ({ ...row, you: who === userId })),
    };
  }

  /**
   * Drops the cached global figures: when a player becomes an admin and so
   * stops counting, or changes their alias.
   */
  function forget(): void {
    cached = null;
  }

  return { getStats, getScoreboard, getSolvers, forget };
}
