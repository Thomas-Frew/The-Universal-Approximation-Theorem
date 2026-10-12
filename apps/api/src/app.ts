import { zValidator } from "@hono/zod-validator";
import {
  type Level,
  type QueryResult,
  queryRequestSchema,
  type RunRequest,
  type RunResult,
  runRequestSchema,
  type SubmissionRequest,
  type SubmissionResult,
  submissionRequestSchema,
} from "@uat/shared";
import { Hono } from "hono";

export type AppDependencies = {
  /** Client-safe levels, in play order. */
  levels: readonly Level[];
  /** Asks a level's machine for its answer to an input. */
  runQuery: (level: Level, input: string) => Promise<QueryResult>;
  /** Runs player programs in the sandbox. `null` if there is no judge. */
  judge: {
    submit: (level: Level, submission: SubmissionRequest) => Promise<SubmissionResult>;
    run: (level: Level, request: RunRequest) => Promise<RunResult>;
  } | null;
};

const JUDGE_OFF = "The judge is not connected.";
const JUDGE_UNREACHABLE = "The judge could not be reached.";

/**
 * The HTTP routes. Everything that needs Node (files, child processes) is
 * passed in, so the web app can import `AppType` without pulling in Node types.
 */
export function createApp({ levels, runQuery, judge }: AppDependencies) {
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
    })
    .post(
      "/levels/:number/submissions",
      zValidator("json", submissionRequestSchema),
      async (c) => {
        const level = findLevel(c.req.param("number"));
        if (!level) {
          return c.json({ error: "No such level." }, 404);
        }
        if (!judge) {
          return c.json({ error: JUDGE_OFF }, 503);
        }
        try {
          return c.json(await judge.submit(level, c.req.valid("json")), 200);
        } catch (error) {
          // Judge0 being down or unreachable is not the player's fault, and
          // must not be counted as a verdict.
          console.error(error);
          return c.json({ error: JUDGE_UNREACHABLE }, 503);
        }
      },
    )
    .post("/levels/:number/runs", zValidator("json", runRequestSchema), async (c) => {
      const level = findLevel(c.req.param("number"));
      if (!level) {
        return c.json({ error: "No such level." }, 404);
      }
      if (!judge) {
        return c.json({ error: JUDGE_OFF }, 503);
      }
      try {
        return c.json(await judge.run(level, c.req.valid("json")), 200);
      } catch (error) {
        console.error(error);
        return c.json({ error: JUDGE_UNREACHABLE }, 503);
      }
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
