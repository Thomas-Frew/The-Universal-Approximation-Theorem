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
