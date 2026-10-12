import type { AppType } from "@uat/api";
import {
  type Level,
  levelSchema,
  type Language,
  type QueryResult,
  queryResultSchema,
  type Observation,
  type RunResult,
  runResultSchema,
  type SubmissionResult,
  submissionResultSchema,
} from "@uat/shared";
import { hc } from "hono/client";

// Same origin as the page: in development Vite proxies /api to the API server
// (see vite.config.ts).
const client = hc<AppType>(window.location.origin);

export async function fetchLevel(number: number): Promise<Level> {
  const response = await client.api.levels[":number"].$get({
    param: { number: String(number) },
  });
  if (!response.ok) {
    throw new Error(`The server answered ${response.status}.`);
  }
  // The types say this is a Level, but only the schema can check it.
  return levelSchema.parse(await response.json());
}

/** Asks a level's machine for its answer. A rejected input is a result, not an error. */
export async function sendQuery(levelNumber: number, input: string): Promise<QueryResult> {
  const response = await client.api.levels[":number"].queries.$post({
    param: { number: String(levelNumber) },
    json: { input },
  });
  if (!response.ok) {
    throw new Error(`The server answered ${response.status}.`);
  }
  return queryResultSchema.parse(await response.json());
}

/** The API explains its own failures as { error }; anything else is a surprise. */
async function failure(response: Response): Promise<Error> {
  const body: unknown = await response.json().catch(() => null);
  const message =
    body && typeof body === "object" && "error" in body && typeof body.error === "string"
      ? body.error
      : `The server answered ${response.status}.`;
  return new Error(message);
}

/** Sends a program to be judged against the level's hidden tests. */
export async function submitCode(
  levelNumber: number,
  language: Language,
  code: string,
): Promise<SubmissionResult> {
  const response = await client.api.levels[":number"].submissions.$post({
    param: { number: String(levelNumber) },
    json: { language, code },
  });
  if (!response.ok) throw await failure(response);
  return submissionResultSchema.parse(await response.json());
}

/** Tries a program against observations the player already has. Free. */
export async function runCode(
  levelNumber: number,
  language: Language,
  code: string,
  observations: readonly Observation[],
): Promise<RunResult> {
  const response = await client.api.levels[":number"].runs.$post({
    param: { number: String(levelNumber) },
    json: {
      language,
      code,
      // Only the two fields the API asks for, whatever else the log keeps.
      observations: observations.map(({ input, output }) => ({ input, output })),
    },
  });
  if (!response.ok) throw await failure(response);
  return runResultSchema.parse(await response.json());
}
