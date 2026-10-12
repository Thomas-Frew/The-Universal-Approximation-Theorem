import type { AppType } from "@uat/api";
import {
  type Level,
  levelSchema,
  type QueryResult,
  queryResultSchema,
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
