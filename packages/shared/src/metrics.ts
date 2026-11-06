import { z } from "zod";

/**
 * The admin metrics page: what players have been doing, per machine and per
 * day. Admins are left out, as from every global figure. Counts cover every
 * version of a machine, since they measure activity, not results.
 */

/** Shortcuts on the page for the last n days, today included. */
export const METRICS_RANGES = [7, 30, 90] as const;

/** The longest range, so the daily chart stays a sensible size. */
export const MAX_METRICS_DAYS = 366;

const DAY_MS = 24 * 60 * 60 * 1000;

/** Days from `from` to `to`, both included, for `YYYY-MM-DD` dates. */
export function daysInRange(from: string, to: string): number {
  return Math.round((Date.parse(to) - Date.parse(from)) / DAY_MS) + 1;
}

/** `GET /admin/metrics?from=YYYY-MM-DD&to=YYYY-MM-DD`: UTC days, both included. */
export const metricsQuerySchema = z
  .object({ from: z.iso.date(), to: z.iso.date() })
  .refine(({ from, to }) => from <= to, "The start must not be after the end.")
  .refine(
    ({ from, to }) => daysInRange(from, to) <= MAX_METRICS_DAYS,
    `A range can be at most ${MAX_METRICS_DAYS} days.`,
  );

const count = z.number().int().nonnegative();

const machineMetricsSchema = z.object({
  number: z.number().int().positive(),
  title: z.string(),
  /** Players who queried, ran or submitted on it. */
  players: count,
  /** Players whose first accepted submission on it falls in the range. */
  solvers: count,
  queries: count,
  /** Queries the validator turned away (free). */
  rejected: count,
  /** Hidden cases shown after a wrong submission. */
  revealed: count,
  runs: count,
  /** Runs that compiled; the rest were compile errors. */
  runsCompiled: count,
  /** Submissions by verdict. */
  submissions: z.object({
    accepted: count,
    wrong_answer: count,
    runtime_error: count,
    time_limit: count,
    compile_error: count,
    judge_error: count,
  }),
});
export type MachineMetrics = z.infer<typeof machineMetricsSchema>;

const dayMetricsSchema = z.object({
  /** The day, `YYYY-MM-DD`, in UTC. */
  day: z.string(),
  /** New anonymous users: every first visit, whether or not they played. */
  visitors: count,
  /** Players who queried, ran or submitted anything that day. */
  activePlayers: count,
  queries: count,
  runs: count,
  submissions: count,
  accepted: count,
});
export type DayMetrics = z.infer<typeof dayMetricsSchema>;

export const metricsResponseSchema = z.object({
  from: z.string(),
  to: z.string(),
  /** Every machine in play, in play order. */
  machines: z.array(machineMetricsSchema),
  /** Oldest first, one entry per day in the range. */
  daily: z.array(dayMetricsSchema),
});
export type MetricsResponse = z.infer<typeof metricsResponseSchema>;
