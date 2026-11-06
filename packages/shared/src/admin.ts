import { z } from "zod";
import { languageSchema } from "./level.ts";
import { aliasSchema, MAX_ALIAS_LENGTH } from "./profile.ts";

/**
 * Admins: players who opened the game with `?admin=<ADMIN_TOKEN>`. They are
 * left out of global stats and can read every player's feedback.
 */

/** `POST /me/admin`: the secret from the `?admin=` link. */
export const adminRequestSchema = z.object({ token: z.string().min(1).max(200) });

/** `GET /me/admin`: whether this player is an admin. */
export const adminStatusSchema = z.object({ admin: z.boolean() });

/**
 * `PUT /admin/alias`: rename another player, found by the alias they have now
 * (aliases are unique regardless of case, so it names exactly one player, and
 * the scoreboard needs no player ids). The new alias follows the same rules
 * as any other.
 */
export const adminAliasRequestSchema = z.object({
  from: z.string().min(1).max(MAX_ALIAS_LENGTH),
  to: aliasSchema,
});

/** A mean of 1-to-8 ratings, or null when nobody gave one. */
const mean = z.number().min(1).max(8).nullable();

/**
 * Who wrote a piece of feedback: the player's alias, the same name the
 * scoreboard shows, so an admin can tell players apart without seeing ids.
 */
const playerTag = z.string();

const levelEntrySchema = z.object({
  player: playerTag,
  version: z.number().int().positive(),
  /** Whether this is about the level's current version; older ones are kept but not averaged. */
  current: z.boolean(),
  /** Whether the player had solved the level when they last sent it. */
  solved: z.boolean(),
  overall: z.number().int().nullable(),
  understanding: z.number().int().nullable(),
  implementation: z.number().int().nullable(),
  comment: z.string(),
  /** ISO time of the last change. */
  at: z.string(),
});
export type AdminLevelEntry = z.infer<typeof levelEntrySchema>;

const levelFeedbackSchema = z.object({
  number: z.number().int().positive(),
  title: z.string(),
  /** Means over the current version's feedback. */
  means: z.object({ overall: mean, understanding: mean, implementation: mean }),
  /** Newest first, every version. */
  entries: z.array(levelEntrySchema),
});
export type AdminLevelFeedback = z.infer<typeof levelFeedbackSchema>;

const gameEntrySchema = z.object({
  player: playerTag,
  overall: z.number().int().nullable(),
  comment: z.string(),
  at: z.string(),
});
export type AdminGameEntry = z.infer<typeof gameEntrySchema>;

/** `GET /admin/feedback`: everything players have said, for admins only. */
export const adminFeedbackResponseSchema = z.object({
  game: z.object({ mean, entries: z.array(gameEntrySchema) }),
  /** Every level in play order, with or without feedback. */
  levels: z.array(levelFeedbackSchema),
});
export type AdminFeedbackResponse = z.infer<typeof adminFeedbackResponseSchema>;

/**
 * Every state a submission can be in, as a tuple so the database enum can
 * reuse it. `pending` while Judge0 works; `judge_error` when no verdict was
 * reached (never charged).
 */
export const SUBMISSION_VERDICTS = [
  "pending",
  "accepted",
  "compile_error",
  "wrong_answer",
  "runtime_error",
  "time_limit",
  "judge_error",
] as const;
export const submissionVerdictSchema = z.enum(SUBMISSION_VERDICTS);
export type SubmissionVerdict = z.infer<typeof submissionVerdictSchema>;

/** Rows per page on the admin submissions page. */
export const ADMIN_SUBMISSIONS_PAGE_SIZE = 50;

/**
 * `GET /admin/submissions`: one page, newest first, optionally narrowed to a
 * machine (by number), a verdict, or players whose alias contains `player`
 * (any case). A page past the end is answered with the last.
 */
export const adminSubmissionsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  machine: z.coerce.number().int().positive().optional(),
  verdict: submissionVerdictSchema.optional(),
  player: z.string().trim().min(1).max(MAX_ALIAS_LENGTH).optional(),
});
/** What the browser sends (all optional, as strings in the address). */
export type AdminSubmissionsQuery = z.input<typeof adminSubmissionsQuerySchema>;
/** The same once checked: `page` a number, defaulting to 1. */
export type AdminSubmissionsFilters = z.output<typeof adminSubmissionsQuerySchema>;

/** `GET /admin/submissions/:id`. */
export const adminSubmissionParamSchema = z.object({ id: z.coerce.number().int().positive() });

const adminSubmissionRowSchema = z.object({
  id: z.number().int().positive(),
  /** The player's alias, as on the scoreboard. */
  player: playerTag,
  /** Whether the player is an admin (whose play is left out of global figures). */
  admin: z.boolean(),
  machine: z.number().int().positive(),
  title: z.string(),
  version: z.number().int().positive(),
  /** Whether it was made on the machine's current version. */
  current: z.boolean(),
  language: languageSchema,
  verdict: submissionVerdictSchema,
  /** The player's first accepted submission on this version: their solve. */
  firstSolve: z.boolean(),
  /** ISO times. */
  submittedAt: z.string(),
  judgedAt: z.string().nullable(),
  /** The slowest test's wall time in ms; null if the program never ran or it was not yet recorded. */
  timeMs: z.number().int().nullable(),
  /** Peak memory over the run, in KB; null as for `timeMs`. */
  memoryKb: z.number().int().nullable(),
  /** The first hidden test that failed, counting from 1. */
  failedTest: z.number().int().positive().nullable(),
  /** How many hidden tests the machine has now; null for an older version, whose tests may differ. */
  tests: z.number().int().positive().nullable(),
});
export type AdminSubmissionRow = z.infer<typeof adminSubmissionRowSchema>;

export const adminSubmissionsResponseSchema = z.object({
  page: z.number().int().positive(),
  pages: z.number().int().positive(),
  /** Submissions matching the filters, on every page. */
  total: z.number().int().nonnegative(),
  rows: z.array(adminSubmissionRowSchema),
});
export type AdminSubmissionsResponse = z.infer<typeof adminSubmissionsResponseSchema>;

/** `GET /admin/submissions/:id`: one submission's code, fetched when an admin opens it. */
export const adminSubmissionCodeSchema = z.object({
  id: z.number().int().positive(),
  language: languageSchema,
  code: z.string(),
});
export type AdminSubmissionCode = z.infer<typeof adminSubmissionCodeSchema>;
