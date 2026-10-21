import { createHash, timingSafeEqual } from "node:crypto";
import type { AdminFeedbackResponse, AdminLevelEntry } from "@uat/shared";
import { desc, eq } from "drizzle-orm";
import type { Database } from "./db/index.ts";
import { excludedPlayers, feedback, gameFeedback } from "./db/schema.ts";
import { GameError } from "./errors.ts";
import type { LoadedLevel } from "./levels.ts";

/**
 * Admins: the game's author and testers. A browser's player becomes one by
 * opening the game with `?admin=<ADMIN_TOKEN>`, which adds them to
 * `excluded_players` (admins are exactly the players left out of global
 * stats). Being an admin also unlocks reading every player's feedback.
 */

const sha256 = (text: string) => createHash("sha256").update(text).digest();

/** The same short tag for every piece of feedback from one player, without showing their id. */
const tagOf = (userId: string) => sha256(userId).toString("hex").slice(0, 6);

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
}: {
  db: Database;
  levels: readonly LoadedLevel[];
  /** ADMIN_TOKEN, or null when the admin link is switched off. */
  token: string | null;
  /** Called when a player becomes an admin, since they stop counting towards global stats. */
  onNewAdmin: () => void;
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

    return {
      game: {
        mean: meanOf(gameRows.map((row) => row.overall)),
        entries: gameRows.map((row) => ({
          player: tagOf(row.userId),
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
            player: tagOf(row.userId),
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

  return { isAdmin, claim, getFeedback };
}
