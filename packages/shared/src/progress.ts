import { z } from "zod";
import { observationSchema } from "./level.ts";

/**
 * One entry in a player's log beyond the free samples: something they asked
 * the machine (`query`, costs a query) or a hidden case a wrong submission
 * revealed (`revealed`, free).
 */
export const logEntrySchema = observationSchema.extend({
  source: z.enum(["query", "revealed"]),
});
export type LogEntry = z.infer<typeof logEntrySchema>;

/**
 * Where a player stands on a level, for its current version. Every number is
 * counted from stored rows; nothing here is stored as a number.
 */
export const progressSchema = z.object({
  /** `new` until the player queries or submits; `solved` after the first accepted submission. */
  status: z.enum(["new", "in_progress", "solved"]),
  log: z.array(logEntrySchema),
  /** Counted only up to the first accepted submission: solving freezes the penalty. */
  queries: z.number().int().nonnegative(),
  wrongSubmissions: z.number().int().nonnegative(),
});
export type Progress = z.infer<typeof progressSchema>;
