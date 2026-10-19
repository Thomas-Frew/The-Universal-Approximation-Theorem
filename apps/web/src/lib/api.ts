import type { AppType } from "@uat/api";
import {
  type Language,
  levelResponseSchema,
  queryResponseSchema,
  type RunResult,
  runResultSchema,
  submissionResponseSchema,
} from "@uat/shared";
import type { z } from "zod";
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
