import { z } from "zod";

/** Longest feedback comment, in characters. */
export const MAX_FEEDBACK_COMMENT_LENGTH = 2000;

/** 1 to 8, or null when the player left it out. */
const rating = z.number().int().min(1).max(8).nullable().default(null);

/**
 * A player's feedback on a level, as the form sends it and the API returns it.
 * Every part is optional, but at least one must be filled in. `overall` runs
 * from 1 (did not enjoy) to 8 (loved it); the two difficulties from 1 (easy)
 * to 8 (very hard).
 */
export const feedbackSchema = z
  .object({
    /** How much they liked the level overall. */
    overall: rating,
    /** Difficulty of working out what the machine does. */
    understanding: rating,
    /** Difficulty of writing the code once understood. */
    implementation: rating,
    comment: z.string().trim().max(MAX_FEEDBACK_COMMENT_LENGTH).default(""),
  })
  .refine(
    (sent) =>
      sent.overall !== null ||
      sent.understanding !== null ||
      sent.implementation !== null ||
      sent.comment !== "",
    { message: "Fill in at least one thing." },
  );
export type Feedback = z.infer<typeof feedbackSchema>;

/** `GET /levels/:number/feedback`: what this player last sent, or null. */
export const feedbackResponseSchema = z.object({ feedback: feedbackSchema.nullable() });

/**
 * One message about the game as a whole, from the settings menu's Feedback
 * page: an overall rating from 1 (did not enjoy) to 8 (loved it) and a
 * comment. Either may be left out, but not both. Each send is kept as a new
 * message, so there is nothing to read back.
 */
export const gameFeedbackSchema = z
  .object({
    overall: rating,
    comment: z.string().trim().max(MAX_FEEDBACK_COMMENT_LENGTH).default(""),
  })
  .refine((sent) => sent.overall !== null || sent.comment !== "", {
    message: "Fill in at least one thing.",
  });
export type GameFeedback = z.infer<typeof gameFeedbackSchema>;
