import { z } from "zod";
import { languageSchema, observationSchema } from "./level.ts";

/** Longest program the API will accept, in characters. */
export const MAX_CODE_LENGTH = 65_536;

export const submissionRequestSchema = z.object({
  language: languageSchema,
  code: z.string().min(1).max(MAX_CODE_LENGTH),
});
export type SubmissionRequest = z.infer<typeof submissionRequestSchema>;

/**
 * The verdict on a submission.
 *
 * - `accepted`: every hidden test passed.
 * - `compile_error`: the program did not build. Costs nothing.
 * - `wrong_answer`, `runtime_error`, `time_limit`: a wrong submission. The
 *   first hidden test it failed is `revealed`, the only hidden case a player
 *   is ever sent.
 */
export const submissionResultSchema = z.discriminatedUnion("status", [
  z.object({ status: z.literal("accepted") }),
  z.object({ status: z.literal("compile_error"), message: z.string() }),
  z.object({
    status: z.enum(["wrong_answer", "runtime_error", "time_limit"]),
    revealed: observationSchema,
  }),
]);
export type SubmissionResult = z.infer<typeof submissionResultSchema>;

/** Most observations one Run will check. */
export const MAX_RUN_OBSERVATIONS = 200;
/** Longest piece of a program's output a Run sends back, in characters. */
export const MAX_RUN_OUTPUT_LENGTH = 2_000;

/**
 * A Run: try a program against observations the player already has. It is
 * free, touches no hidden test, and so is allowed to show the program's output.
 */
export const runRequestSchema = submissionRequestSchema.extend({
  observations: z.array(observationSchema).min(1).max(MAX_RUN_OBSERVATIONS),
});
export type RunRequest = z.infer<typeof runRequestSchema>;

export const runOutcomeSchema = z.object({
  verdict: z.enum(["passed", "wrong_answer", "runtime_error", "time_limit"]),
  /** What the program printed, cut to `MAX_RUN_OUTPUT_LENGTH`. */
  actual: z.string(),
});
export type RunOutcome = z.infer<typeof runOutcomeSchema>;

export const runResultSchema = z.discriminatedUnion("status", [
  z.object({ status: z.literal("compile_error"), message: z.string() }),
  /** One outcome per observation, in the order they were sent. */
  z.object({ status: z.literal("ran"), outcomes: z.array(runOutcomeSchema) }),
]);
export type RunResult = z.infer<typeof runResultSchema>;
