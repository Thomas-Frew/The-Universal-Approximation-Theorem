import { z } from "zod";

/** Longest query input the API will look at, in characters. */
export const MAX_QUERY_INPUT_LENGTH = 65_536;

export const queryRequestSchema = z.object({
  input: z.string().max(MAX_QUERY_INPUT_LENGTH),
});
export type QueryRequest = z.infer<typeof queryRequestSchema>;

/**
 * The answer to a query. `rejected` means the level's input validator refused
 * the input: it costs nothing, and `message` is the validator's explanation.
 */
export const queryResultSchema = z.discriminatedUnion("status", [
  z.object({
    status: z.literal("ok"),
    /** The input as the machine saw it, after normalisation. */
    input: z.string(),
    output: z.string(),
  }),
  z.object({
    status: z.literal("rejected"),
    message: z.string(),
  }),
]);
export type QueryResult = z.infer<typeof queryResultSchema>;
