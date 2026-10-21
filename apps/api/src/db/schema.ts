import { LANGUAGES } from "@uat/shared";
import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  index,
  integer,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { user } from "./auth-schema.ts";

/**
 * The game's tables. Better Auth's tables (`user`, `session`, `account`,
 * `verification`) are generated into `auth-schema.ts` and re-exported here, so
 * this file is the whole database as drizzle-kit sees it.
 *
 * Two rules shape everything below:
 * - Counts and penalty are never stored. They are counted from `observations`
 *   and `submissions` whenever they are needed.
 * - Every per-player row records the level version. Reading only the current
 *   version is what makes a changed level start afresh.
 */
export * from "./auth-schema.ts";

/** How an observation got into the log: a query (costs 1) or a revealed hidden case (free). */
export const observationSource = pgEnum("observation_source", ["query", "revealed"]);

export const submissionLanguage = pgEnum("submission_language", LANGUAGES);

/**
 * `pending` while Judge0 works. `judge_error` means no verdict was reached
 * (Judge0 down, or the API restarted mid-judging) and costs nothing.
 */
export const submissionVerdict = pgEnum("submission_verdict", [
  "pending",
  "accepted",
  "compile_error",
  "wrong_answer",
  "runtime_error",
  "time_limit",
  "judge_error",
]);

// Fresh column builders per table: Drizzle builders must not be shared.
const levelColumns = () => ({
  /** The level's uuid from problem.yaml. No foreign key: levels live in files. */
  levelId: uuid("level_id").notNull(),
  levelVersion: integer("level_version").notNull(),
});

const playerColumn = () =>
  text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" });

const createdAtColumn = () =>
  timestamp("created_at", { withTimezone: true }).defaultNow().notNull();

/**
 * A player's observation log, beyond the samples (which come from the level).
 *
 * Inputs can be up to 64 KB, too long for a Postgres index entry, so rows are
 * matched on `input_hash`: the SHA-256 of the normalised input, in hex,
 * computed by the API.
 */
export const observations = pgTable(
  "observations",
  {
    id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
    userId: playerColumn(),
    ...levelColumns(),
    input: text("input").notNull(),
    inputHash: text("input_hash").notNull(),
    output: text("output").notNull(),
    source: observationSource("source").notNull(),
    createdAt: createdAtColumn(),
  },
  (table) => [
    // One row per input: inserting a repeat does nothing, so it is never charged.
    // Its leading columns also serve "this player's log for this level".
    uniqueIndex("observations_player_input_idx").on(
      table.userId,
      table.levelId,
      table.levelVersion,
      table.inputHash,
    ),
  ],
);

/** Every submission a player makes, with its verdict once Judge0 has given one. */
export const submissions = pgTable(
  "submissions",
  {
    id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
    userId: playerColumn(),
    ...levelColumns(),
    language: submissionLanguage("language").notNull(),
    code: text("code").notNull(),
    verdict: submissionVerdict("verdict").default("pending").notNull(),
    createdAt: createdAtColumn(),
    judgedAt: timestamp("judged_at", { withTimezone: true }),
  },
  (table) => [
    index("submissions_player_level_idx").on(table.userId, table.levelId, table.levelVersion),
    // At most one pending submission per player: the database enforces
    // "one submission in flight", so two quick clicks cannot both be judged.
    uniqueIndex("submissions_one_pending_idx")
      .on(table.userId)
      .where(sql`${table.verdict} = 'pending'`),
  ],
);

/** The machine's answers, shared by every player: the query cache. */
export const machineAnswers = pgTable(
  "machine_answers",
  {
    ...levelColumns(),
    inputHash: text("input_hash").notNull(),
    input: text("input").notNull(),
    output: text("output").notNull(),
    createdAt: createdAtColumn(),
  },
  (table) => [primaryKey({ columns: [table.levelId, table.levelVersion, table.inputHash] })],
);

/**
 * Seconds a player has spent with a level open, for the stats page. The one
 * stored number in the game: time cannot be counted from other rows, only
 * measured. While a level is open in a visible tab, the browser sends a
 * heartbeat every 30 seconds and each one adds 30 here (see `heartbeat` in
 * game.ts, which ignores beats that come too fast and beats after the level
 * is solved, so time freezes on solving, like penalty).
 */
export const playTime = pgTable(
  "play_time",
  {
    userId: playerColumn(),
    ...levelColumns(),
    seconds: integer("seconds").default(0).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [primaryKey({ columns: [table.userId, table.levelId, table.levelVersion] })],
);

/**
 * Admins: the game's author and testers. They are left out of every global
 * figure on the stats page (means, first solves), though their own stats page
 * still shows their numbers, and they can read every player's feedback. A
 * browser's player is added by opening the game with `?admin=<ADMIN_TOKEN>`
 * (see admin.ts). Named for its first job, from before there were admins.
 */
export const excludedPlayers = pgTable("excluded_players", {
  userId: text("user_id")
    .primaryKey()
    .references(() => user.id, { onDelete: "cascade" }),
  createdAt: createdAtColumn(),
});

/**
 * What a player thinks of a level: how hard it was to work out what the
 * machine does, how hard to implement, and an overall rating, each 1 to 8,
 * plus an optional comment. One row per player per level version; sending
 * again replaces it. `solved` records whether they had solved the level when
 * they last sent it, since the same rating means something different from a
 * player who gave up. Not progress: wiping progress keeps it.
 */
export const feedback = pgTable(
  "feedback",
  {
    userId: playerColumn(),
    ...levelColumns(),
    // Each rating is optional: null means the player left it out.
    understanding: integer("understanding"),
    implementation: integer("implementation"),
    overall: integer("overall"),
    comment: text("comment").default("").notNull(),
    solved: boolean("solved").notNull(),
    createdAt: createdAtColumn(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.levelId, table.levelVersion] }),
    // The schema checks these too; this keeps the table right whatever writes to it.
    // `between` on a null is null, which a check treats as passing, so a
    // left-out rating is allowed and a given one must be 1 to 8.
    check(
      "feedback_ratings_range",
      sql`${table.understanding} between 1 and 8 and ${table.implementation} between 1 and 8 and ${table.overall} between 1 and 8`,
    ),
    // Everything is optional, but a row must say something.
    check(
      "feedback_not_empty",
      sql`${table.overall} is not null or ${table.understanding} is not null or ${table.implementation} is not null or ${table.comment} <> ''`,
    ),
  ],
);

/**
 * What a player thinks of the game as a whole, from the settings menu's
 * Feedback page: an overall rating 1 to 8 and a comment, either optional.
 * Unlike level feedback, every send is a new row, never a replacement, so a
 * player can write as often as they like (up to `MAX_GAME_FEEDBACK` in
 * game.ts). Not progress: wiping progress keeps it.
 */
export const gameFeedback = pgTable(
  "game_feedback",
  {
    id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
    userId: playerColumn(),
    overall: integer("overall"),
    comment: text("comment").default("").notNull(),
    createdAt: createdAtColumn(),
  },
  (table) => [
    index("game_feedback_player_idx").on(table.userId),
    check("game_feedback_overall_range", sql`${table.overall} between 1 and 8`),
    check("game_feedback_not_empty", sql`${table.overall} is not null or ${table.comment} <> ''`),
  ],
);
