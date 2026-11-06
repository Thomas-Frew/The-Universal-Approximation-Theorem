import type { AppType } from "@uat/api";
import {
  type AdminFeedbackResponse,
  type AdminSubmissionCode,
  type AdminSubmissionsQuery,
  type AdminSubmissionsResponse,
  adminFeedbackResponseSchema,
  adminStatusSchema,
  adminSubmissionCodeSchema,
  adminSubmissionsResponseSchema,
  type Feedback,
  feedbackResponseSchema,
  type GameFeedback,
  type Language,
  levelListResponseSchema,
  levelResponseSchema,
  type MetricsResponse,
  metricsResponseSchema,
  type ProfileResponse,
  profileResponseSchema,
  progressSchema,
  queryResponseSchema,
  type RunResult,
  runResultSchema,
  type ScoreboardResponse,
  type StatsResponse,
  scoreboardResponseSchema,
  solversResponseSchema,
  type SolversResponse,
  statsResponseSchema,
  submissionResponseSchema,
} from "@uat/shared";
import { z } from "zod";
import { hc } from "hono/client";
import { ensureSession } from "./session";

// Same origin as the page: in development Vite proxies /api to the API server
// (see vite.config.ts).
const client = hc<AppType>(window.location.origin);

/** The API explains its own failures as { error }; anything else is a surprise. */
async function failure(response: Response): Promise<Error> {
  const body: unknown = await response.json().catch(() => null);
  const message =
    body && typeof body === "object" && "error" in body && typeof body.error === "string"
      ? body.error
      : `The server answered ${response.status}.`;
  return new Error(message);
}

/** A level and the player's progress on it. */
export type LevelResponse = z.infer<typeof levelResponseSchema>;

export async function fetchLevel(number: number): Promise<LevelResponse> {
  await ensureSession();
  const response = await client.api.levels[":number"].$get({
    param: { number: String(number) },
  });
  if (!response.ok) throw await failure(response);
  // The types say what this is, but only the schema can check it.
  return levelResponseSchema.parse(await response.json());
}

/** Every level and the player's standing on each, for the level select. */
export type LevelListResponse = z.infer<typeof levelListResponseSchema>;

export async function fetchLevels(): Promise<LevelListResponse> {
  await ensureSession();
  const response = await client.api.levels.$get();
  if (!response.ok) throw await failure(response);
  return levelListResponseSchema.parse(await response.json());
}

/** Asks a level's machine for its answer. A rejected input is a result, not an error. */
export async function sendQuery(levelNumber: number, input: string) {
  await ensureSession();
  const response = await client.api.levels[":number"].queries.$post({
    param: { number: String(levelNumber) },
    json: { input },
  });
  if (!response.ok) throw await failure(response);
  return queryResponseSchema.parse(await response.json());
}

/** Sends a program to be judged against the level's hidden tests. */
export async function submitCode(levelNumber: number, language: Language, code: string) {
  await ensureSession();
  const response = await client.api.levels[":number"].submissions.$post({
    param: { number: String(levelNumber) },
    json: { language, code },
  });
  if (!response.ok) throw await failure(response);
  return submissionResponseSchema.parse(await response.json());
}

/**
 * Tries a program against the observations in the player's log. Free. The
 * server reads the log itself, so only the code is sent.
 */
export async function runCode(
  levelNumber: number,
  language: Language,
  code: string,
): Promise<RunResult> {
  await ensureSession();
  const response = await client.api.levels[":number"].runs.$post({
    param: { number: String(levelNumber) },
    json: { language, code },
  });
  if (!response.ok) throw await failure(response);
  return runResultSchema.parse(await response.json());
}

/** Clears the player's progress on a level, so they start it afresh. Demo only. */
export async function resetProgress(levelNumber: number) {
  await ensureSession();
  const response = await client.api.levels[":number"].progress.$delete({
    param: { number: String(levelNumber) },
  });
  if (!response.ok) throw await failure(response);
  return z.object({ progress: progressSchema }).parse(await response.json()).progress;
}

/** Deletes everything the player has done, on every level. They keep their session. */
export async function wipeProgress(): Promise<void> {
  await ensureSession();
  const response = await client.api.progress.$delete();
  if (!response.ok) throw await failure(response);
}

/** The player's statistics, for the stats page. */
export async function fetchStats(): Promise<StatsResponse> {
  await ensureSession();
  const response = await client.api.stats.$get();
  if (!response.ok) throw await failure(response);
  return statsResponseSchema.parse(await response.json());
}

/** One page of the scoreboard (from 0), with the player's own row. */
export async function fetchScoreboard(page: number): Promise<ScoreboardResponse> {
  await ensureSession();
  const response = await client.api.scoreboard.$get({ query: { page: String(page) } });
  if (!response.ok) throw await failure(response);
  return scoreboardResponseSchema.parse(await response.json());
}

/** Everyone who has solved one machine, in the order they solved it. */
export async function fetchSolvers(machine: number): Promise<SolversResponse> {
  await ensureSession();
  const response = await client.api.solvers.$get({ query: { machine: String(machine) } });
  if (!response.ok) throw await failure(response);
  return solversResponseSchema.parse(await response.json());
}

/**
 * "Still here": called every HEARTBEAT_SECONDS while a level is open in a
 * visible tab, to count time played, and with `start` when it opens or its
 * tab comes back into view. Failures are ignored: a missed beat only loses
 * half a minute of timing, never anything the player sees.
 */
export async function sendHeartbeat(levelNumber: number, start = false): Promise<void> {
  await ensureSession();
  await client.api.levels[":number"].heartbeat
    .$post({ param: { number: String(levelNumber) }, json: { start } })
    .catch(() => undefined);
}

/** The `?admin=` link: make this browser's player an admin. */
export async function claimAdmin(token: string): Promise<void> {
  await ensureSession();
  const response = await client.api.me.admin.$post({ json: { token } });
  if (!response.ok) throw await failure(response);
}

/** Whether this browser's player is an admin. */
export async function fetchIsAdmin(): Promise<boolean> {
  await ensureSession();
  const response = await client.api.me.admin.$get();
  if (!response.ok) throw await failure(response);
  return adminStatusSchema.parse(await response.json()).admin;
}

/** Admins only: everything players have said, about the game and each level. */
export async function fetchAdminFeedback(): Promise<AdminFeedbackResponse> {
  await ensureSession();
  const response = await client.api.admin.feedback.$get();
  if (!response.ok) throw await failure(response);
  return adminFeedbackResponseSchema.parse(await response.json());
}

/** Admins only: queries, Runs and submissions per machine and per day, between two UTC days (`YYYY-MM-DD`, both included). */
export async function fetchMetrics(from: string, to: string): Promise<MetricsResponse> {
  await ensureSession();
  const response = await client.api.admin.metrics.$get({ query: { from, to } });
  if (!response.ok) throw await failure(response);
  return metricsResponseSchema.parse(await response.json());
}

/** Admins only: one page of every player's submissions, newest first, without code. */
export async function fetchAdminSubmissions(filters: {
  page: number;
  machine?: number;
  verdict?: AdminSubmissionsQuery["verdict"];
  player?: string;
}): Promise<AdminSubmissionsResponse> {
  await ensureSession();
  // Only the filters in use go into the address, all as text.
  const query: Record<string, string> = { page: String(filters.page) };
  if (filters.machine !== undefined) query.machine = String(filters.machine);
  if (filters.verdict) query.verdict = filters.verdict;
  if (filters.player?.trim()) query.player = filters.player.trim();
  const response = await client.api.admin.submissions.$get({ query });
  if (!response.ok) throw await failure(response);
  return adminSubmissionsResponseSchema.parse(await response.json());
}

/** Admins only: one submission's code. */
export async function fetchAdminSubmissionCode(id: number): Promise<AdminSubmissionCode> {
  await ensureSession();
  const response = await client.api.admin.submissions[":id"].$get({ param: { id: String(id) } });
  if (!response.ok) throw await failure(response);
  return adminSubmissionCodeSchema.parse(await response.json());
}

/** What the player last said about a level, or null if they have not yet. */
export async function fetchFeedback(levelNumber: number): Promise<Feedback | null> {
  await ensureSession();
  const response = await client.api.levels[":number"].feedback.$get({
    param: { number: String(levelNumber) },
  });
  if (!response.ok) throw await failure(response);
  return feedbackResponseSchema.parse(await response.json()).feedback;
}

/** Saves the player's feedback on a level, replacing any they sent before. */
export async function sendFeedback(levelNumber: number, feedback: Feedback): Promise<void> {
  await ensureSession();
  const response = await client.api.levels[":number"].feedback.$put({
    param: { number: String(levelNumber) },
    json: feedback,
  });
  if (!response.ok) throw await failure(response);
}

/** Sends a message about the whole game. Each one is kept; none replaces another. */
export async function sendGameFeedback(feedback: GameFeedback): Promise<void> {
  await ensureSession();
  const response = await client.api.me.feedback.$post({ json: feedback });
  if (!response.ok) throw await failure(response);
}

/** This player's save key and alias. The key is made the first time this is asked. */
export async function fetchProfile(): Promise<ProfileResponse> {
  await ensureSession();
  const response = await client.api.me.profile.$get();
  if (!response.ok) throw await failure(response);
  return profileResponseSchema.parse(await response.json());
}

/** Changes the player's alias. Already checked with `aliasSchema`. */
export async function saveAlias(alias: string): Promise<void> {
  await ensureSession();
  const response = await client.api.me.alias.$put({ json: { alias } });
  if (!response.ok) throw await failure(response);
}

/** Admins only: renames the player whose alias is `from`. `to` is already checked with `aliasSchema`. */
export async function renameAlias(from: string, to: string): Promise<void> {
  await ensureSession();
  const response = await client.api.admin.alias.$put({ json: { from, to } });
  if (!response.ok) throw await failure(response);
}

/**
 * Signs this browser in as the player a save key belongs to. Better Auth's
 * endpoint (see the API's auth.ts), so it is called directly rather than
 * through the typed client, and explains failures as { message }. The new
 * session cookie replaces this browser's; reload the page afterwards.
 */
export async function loadSaveKey(key: string): Promise<void> {
  const response = await fetch("/api/auth/save-key/load", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ key }),
  });
  if (response.ok) return;
  const body: unknown = await response.json().catch(() => null);
  throw new Error(
    body && typeof body === "object" && "message" in body && typeof body.message === "string"
      ? body.message
      : response.status === 429
        ? "Too many tries. Wait a minute and try again."
        : `The server answered ${response.status}.`,
  );
}
