import { zValidator } from "@hono/zod-validator";
import { type Level, type QueryResult, queryRequestSchema } from "@uat/shared";
import { Hono } from "hono";

export type AppDependencies = {
  /** Client-safe levels, in play order. */
  levels: readonly Level[];
  /** Asks a level's machine for its answer to an input. */
  runQuery: (level: Level, input: string) => Promise<QueryResult>;
};

/**
 * The HTTP routes. Everything that needs Node (files, child processes) is
 * passed in, so the web app can import `AppType` without pulling in Node types.
 */
export function createApp({ levels, runQuery }: AppDependencies) {
  const findLevel = (number: string) =>
    levels.find((candidate) => String(candidate.number) === number);

  const app = new Hono()
    .basePath("/api")
    .get("/levels/:number", (c) => {
      const level = findLevel(c.req.param("number"));
      if (!level) {
        return c.json({ error: "No such level." }, 404);
      }
      return c.json(level, 200);
    })
    .post("/levels/:number/queries", zValidator("json", queryRequestSchema), async (c) => {
      const level = findLevel(c.req.param("number"));
      if (!level) {
        return c.json({ error: "No such level." }, 404);
      }
      const result = await runQuery(level, c.req.valid("json").input);
      return c.json(result, 200);
    });

  app.onError((error, c) => {
    // The details go to the log, never to the player.
    console.error(error);
    return c.json({ error: "Something went wrong on the server." }, 500);
  });

  return app;
}

/** The shape of the API, read by the web app's typed client (`hc<AppType>`). */
export type AppType = ReturnType<typeof createApp>;
