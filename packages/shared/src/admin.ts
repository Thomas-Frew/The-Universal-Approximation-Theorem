import { z } from "zod";

/**
 * Admins: players who opened the game with `?admin=<ADMIN_TOKEN>`. They are
 * left out of global stats and can read every player's feedback.
 */

/** `POST /me/admin`: the secret from the `?admin=` link. */
export const adminRequestSchema = z.object({ token: z.string().min(1).max(200) });

/** `GET /me/admin`: whether this player is an admin. */
export const adminStatusSchema = z.object({ admin: z.boolean() });

/** A mean of 1-to-8 ratings, or null when nobody gave one. */
const mean = z.number().min(1).max(8).nullable();

/**
 * Who wrote a piece of feedback: a short tag made from a hash of the player's
 * id, the same for all their feedback, so an admin can tell one player from
 * another without seeing ids.
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
