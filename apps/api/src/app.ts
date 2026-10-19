import { zValidator } from "@hono/zod-validator";
import {
  type Level,
  type Progress,
  type QueryResult,
  queryRequestSchema,
  type RunResult,
  runRequestSchema,
  type SubmissionRequest,
  type SubmissionResult,
  submissionRequestSchema,
} from "@uat/shared";
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { GameError } from "./errors.ts";

/** What the routes need from Better Auth, kept to plain web types. */
export type AuthDependencies = {
  /** Better Auth's own endpoints (sign in, get session, sign out). */
  handler: (request: Request) => Promise<Response>;
  /** The player behind a request's session cookie, or null if there is none. */
  getUserId: (headers: Headers) => Promise<string | null>;
};

/** The game's rules, as plain functions of a player and a level. See `game.ts`. */
export type GameDependencies = {
  getProgress: (userId: string, level: Level) => Promise<Progress>;
  query: (
    userId: string,
    level: Level,
    input: string,
  ) => Promise<{ result: QueryResult; progress: Progress }>;
  submit: (
    userId: string,
    level: Level,
    submission: SubmissionRequest,
  ) => Promise<{ verdict: SubmissionResult; progress: Progress }>;
  run: (userId: string, level: Level, submission: SubmissionRequest) => Promise<RunResult>;
  resetProgress: (userId: string, level: Level) => Promise<Progress>;
};

/** Values the middleware attaches to each request, read with `c.get(...)`. */
type Variables = { userId: string; level: Level };

export type AppDependencies = {
  auth: AuthDependencies;
  /** Client-safe levels, in play order. In demo mode, only the first. */
  levels: readonly Level[];
  /** Whether this is the public demo; passed on to the browser with each level. */
  demo: boolean;
  game: GameDependencies;
};

/**
 * The HTTP routes. Everything that needs Node (files, child processes, the
 * database) is passed in, so the web app can import `AppType` without pulling
 * in Node types.
 */
export function createApp({ auth, levels, demo, game }: AppDependencies) {
  const app = new Hono<{ Variables: Variables }>()
    .basePath("/api")
    // Before anything reads a body. The schemas cap code and query input at
    // 64K characters, but only once the whole body has been read; this stops
    // an oversized one while it arrives (by Content-Length, or by counting
    // bytes if the header is missing). 256 KB leaves room for JSON escapes:
    // 64K characters of code full of newlines and quotes is already 128 KB.
    .use(
      bodyLimit({
        maxSize: 256 * 1024,
        onError: (c) => c.json({ error: "That request is too large." }, 413),
      }),
    )
    // Better Auth answers everything under /api/auth itself.
    .on(["GET", "POST"], "/auth/*", (c) => auth.handler(c.req.raw))
    // Every game route needs a player. The browser signs in anonymously before
    // its first call, so a request without a session is a bug or a stranger.
    .use("/levels/*", async (c, next) => {
      const userId = await auth.getUserId(c.req.raw.headers);
      if (!userId) {
        return c.json({ error: "No session. Reload the page to start one." }, 401);
      }
      c.set("userId", userId);
      await next();
    })
    // ...and every one of them is about one level.
    .use("/levels/:number/*", async (c, next) => {
      const level = levels.find((candidate) => String(candidate.number) === c.req.param("number"));
      if (!level) {
        return c.json({ error: "No such level." }, 404);
      }
      c.set("level", level);
      await next();
    })
    .get("/levels/:number", async (c) => {
      const level = levels.find((candidate) => String(candidate.number) === c.req.param("number"));
      if (!level) {
        return c.json({ error: "No such level." }, 404);
      }
      const progress = await game.getProgress(c.get("userId"), level);
      return c.json({ level, progress, demo }, 200);
    })
    .post("/levels/:number/queries", zValidator("json", queryRequestSchema), async (c) =>
      c.json(await game.query(c.get("userId"), c.get("level"), c.req.valid("json").input), 200),
    )
    .post("/levels/:number/submissions", zValidator("json", submissionRequestSchema), async (c) =>
      c.json(await game.submit(c.get("userId"), c.get("level"), c.req.valid("json")), 200),
    )
    .post("/levels/:number/runs", zValidator("json", runRequestSchema), async (c) =>
      c.json(await game.run(c.get("userId"), c.get("level"), c.req.valid("json")), 200),
    )
    // Start the level afresh. Demo only: in the full game it would let a
    // player wipe a bad penalty.
    .delete("/levels/:number/progress", async (c) => {
      if (!demo) {
        throw new GameError(403, "Progress can only be reset in the demo.");
      }
      return c.json({ progress: await game.resetProgress(c.get("userId"), c.get("level")) }, 200);
    });

  app.onError((error, c) => {
    // Problems the player should hear about carry their own status and message.
    if (error instanceof GameError) {
      return c.json({ error: error.message }, error.status);
    }
    // Anything else: the details go to the log, never to the player.
    console.error(error);
    return c.json({ error: "Something went wrong on the server." }, 500);
  });

  return app;
}

/** The shape of the API, read by the web app's typed client (`hc<AppType>`). */
export type AppType = ReturnType<typeof createApp>;
