import { createHash, timingSafeEqual } from "node:crypto";
import {
  ADMIN_SUBMISSIONS_PAGE_SIZE,
  type AdminFeedbackResponse,
  type AdminLevelEntry,
  type AdminSubmissionCode,
  type AdminSubmissionsFilters,
  type AdminSubmissionsResponse,
} from "@uat/shared";
import { and, count, desc, eq, ilike, inArray, sql } from "drizzle-orm";
import type { Database } from "./db/index.ts";
import { excludedPlayers, feedback, gameFeedback, playerProfiles, submissions } from "./db/schema.ts";
import { GameError } from "./errors.ts";
import type { LoadedLevel } from "./levels.ts";
import { tagOf } from "./playerTag.ts";

/**
 * Admins: the game's author and testers. A browser's player becomes one by
 * opening the game with `?admin=<ADMIN_TOKEN>`, which adds them to
 * `excluded_players` (admins are exactly the players left out of global
 * stats). Being an admin also unlocks reading every player's feedback.
 */

const sha256 = (text: string) => createHash("sha256").update(text).digest();

/** The mean of the ratings given, or null if none were. */
function meanOf(values: (number | null)[]): number | null {
  const given = values.filter((value) => value !== null);
  return given.length === 0 ? null : given.reduce((sum, value) => sum + value, 0) / given.length;
}

export function createAdmin({
  db,
  levels,
  token,
  onNewAdmin,
  aliasesOf,
}: {
  db: Database;
  levels: readonly LoadedLevel[];
  /** ADMIN_TOKEN, or null when the admin link is switched off. */
  token: string | null;
  /** Called when a player becomes an admin, since they stop counting towards global stats. */
  onNewAdmin: () => void;
  /** Players' aliases, from `profiles.ts`, which makes one for any player without. */
  aliasesOf: (userIds: string[]) => Promise<Map<string, string>>;
}) {
  async function isAdmin(userId: string): Promise<boolean> {
    const [row] = await db
      .select({ userId: excludedPlayers.userId })
      .from(excludedPlayers)
      .where(eq(excludedPlayers.userId, userId));
    return row !== undefined;
  }

  /**
   * Makes this player an admin, for good, if `sent` is ADMIN_TOKEN. Compared
   * in constant time (as hashes, so the lengths match too), so the response
   * time says nothing about how much of a guess was right.
   */
  async function claim(userId: string, sent: string): Promise<void> {
    if (!token || !timingSafeEqual(sha256(sent), sha256(token))) {
      throw new GameError(403, "That link is not valid.");
    }
    await db.insert(excludedPlayers).values({ userId }).onConflictDoNothing();
    onNewAdmin();
  }

  /** Everything players have said, about the game and about each level in play. */
  async function getFeedback(): Promise<AdminFeedbackResponse> {
    const [gameRows, levelRows] = await Promise.all([
      db.select().from(gameFeedback).orderBy(desc(gameFeedback.createdAt)),
      db.select().from(feedback).orderBy(desc(feedback.updatedAt)),
    ]);
    // Everyone who wrote anything, looked up in one query. Everyone has an
    // alias; the tag is only a fallback that should never show.
    const aliases = await aliasesOf([...new Set([...gameRows, ...levelRows].map((row) => row.userId))]);
    const nameOf = (userId: string) => aliases.get(userId) ?? tagOf(userId);

    return {
      game: {
        mean: meanOf(gameRows.map((row) => row.overall)),
        entries: gameRows.map((row) => ({
          player: nameOf(row.userId),
          overall: row.overall,
          comment: row.comment,
          at: row.createdAt.toISOString(),
        })),
      },
      // Feedback on a level no longer in play is left out.
      levels: levels.map(({ level }) => {
        const entries: AdminLevelEntry[] = levelRows
          .filter((row) => row.levelId === level.id)
          .map((row) => ({
            player: nameOf(row.userId),
            version: row.levelVersion,
            current: row.levelVersion === level.version,
            solved: row.solved,
            overall: row.overall,
            understanding: row.understanding,
            implementation: row.implementation,
            comment: row.comment,
            at: row.updatedAt.toISOString(),
          }));
        // Only the current version is averaged: a changed level is a different level.
        const current = entries.filter((entry) => entry.current);
        return {
          number: level.number,
          title: level.title,
          means: {
            overall: meanOf(current.map((entry) => entry.overall)),
            understanding: meanOf(current.map((entry) => entry.understanding)),
            implementation: meanOf(current.map((entry) => entry.implementation)),
          },
          entries,
        };
      }),
    };
  }

  /**
   * One page of submissions, newest first, on machines in play (every
   * version), admins' included and marked. Code is left out: an admin fetches
   * one submission's with `getSubmissionCode` when they open it.
   */
  async function getSubmissions(filters: AdminSubmissionsFilters): Promise<AdminSubmissionsResponse> {
    const byId = new Map(levels.map((loaded) => [loaded.level.id, loaded]));
    const conditions = [inArray(submissions.levelId, [...byId.keys()])];
    if (filters.machine !== undefined) {
      // A number not in play matches nothing.
      const loaded = levels.find(({ level }) => level.number === filters.machine);
      conditions.push(eq(submissions.levelId, loaded?.level.id ?? ""));
    }
    if (filters.verdict) conditions.push(eq(submissions.verdict, filters.verdict));
    if (filters.player) {
      // Part of an alias, any case. `%`, `_` and `\` are taken literally.
      const pattern = `%${filters.player.replace(/[\\%_]/g, (character) => `\\${character}`)}%`;
      conditions.push(
        inArray(
          submissions.userId,
          db.select({ userId: playerProfiles.userId }).from(playerProfiles).where(ilike(playerProfiles.alias, pattern)),
        ),
      );
    }
    const where = and(...conditions);

    const [counted] = await db.select({ total: count() }).from(submissions).where(where);
    const total = counted?.total ?? 0;
    const pages = Math.max(1, Math.ceil(total / ADMIN_SUBMISSIONS_PAGE_SIZE));
    // Past the end (filters narrowed, or a hand-typed page): the last page.
    const page = Math.min(filters.page, pages);

    const rows = await db
      .select({
        id: submissions.id,
        userId: submissions.userId,
        levelId: submissions.levelId,
        levelVersion: submissions.levelVersion,
        language: submissions.language,
        verdict: submissions.verdict,
        createdAt: submissions.createdAt,
        judgedAt: submissions.judgedAt,
        timeMs: submissions.timeMs,
        memoryKb: submissions.memoryKb,
        failedTest: submissions.failedTest,
        // The outer row is named in full ("submissions".col) in these two:
        // Drizzle writes a column inside `sql` without its table, and in a
        // subquery a bare name means the subquery's own table, which made
        // both always true.
        // Accepted, with no accepted submission before it by the same
        // player on the same version: the one that solved it.
        firstSolve: sql<boolean>`"submissions"."verdict" = 'accepted' and not exists (
          select 1 from ${submissions} as earlier
          where earlier.user_id = "submissions"."user_id"
            and earlier.level_id = "submissions"."level_id"
            and earlier.level_version = "submissions"."level_version"
            and earlier.verdict = 'accepted'
            and earlier.id < "submissions"."id")`,
        admin: sql<boolean>`exists (
          select 1 from ${excludedPlayers} as admins where admins.user_id = "submissions"."user_id")`,
      })
      .from(submissions)
      .where(where)
      .orderBy(desc(submissions.id))
      .limit(ADMIN_SUBMISSIONS_PAGE_SIZE)
      .offset((page - 1) * ADMIN_SUBMISSIONS_PAGE_SIZE);

    const aliases = await aliasesOf([...new Set(rows.map((row) => row.userId))]);
    return {
      page,
      pages,
      total,
      rows: rows.map((row) => {
        // Every row's level is in play: the query only asks for those.
        const { level, secrets } = byId.get(row.levelId)!;
        const current = row.levelVersion === level.version;
        return {
          id: row.id,
          player: aliases.get(row.userId) ?? tagOf(row.userId),
          admin: row.admin,
          machine: level.number,
          title: level.title,
          version: row.levelVersion,
          current,
          language: row.language,
          verdict: row.verdict,
          firstSolve: row.firstSolve,
          submittedAt: row.createdAt.toISOString(),
          judgedAt: row.judgedAt?.toISOString() ?? null,
          timeMs: row.timeMs,
          memoryKb: row.memoryKb,
          failedTest: row.failedTest,
          tests: current ? secrets.length : null,
        };
      }),
    };
  }

  /** One submission's code. 404 for an id that does not exist. */
  async function getSubmissionCode(id: number): Promise<AdminSubmissionCode> {
    const [row] = await db
      .select({ id: submissions.id, language: submissions.language, code: submissions.code })
      .from(submissions)
      .where(eq(submissions.id, id));
    if (!row) throw new GameError(404, "No submission has that id.");
    return row;
  }

  return { isAdmin, claim, getFeedback, getSubmissions, getSubmissionCode };
}
