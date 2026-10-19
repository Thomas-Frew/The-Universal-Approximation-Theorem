import { z } from "zod";
import { levelSchema } from "./level.ts";
import { progressSchema } from "./progress.ts";
import { queryResultSchema } from "./query.ts";
import { submissionResultSchema } from "./submission.ts";

/**
 * What the level routes answer. Each carries the player's progress after the
 * action, so the browser never has to work out counts or the log itself.
 */
export const levelResponseSchema = z.object({ level: levelSchema, progress: progressSchema });
export const queryResponseSchema = z.object({ result: queryResultSchema, progress: progressSchema });
export const submissionResponseSchema = z.object({
  verdict: submissionResultSchema,
  progress: progressSchema,
});
