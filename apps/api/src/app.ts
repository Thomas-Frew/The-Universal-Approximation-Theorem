import { zValidator } from "@hono/zod-validator";
import {
  type AdminFeedbackResponse,
  adminRequestSchema,
  adminAliasRequestSchema,
  adminSubmissionParamSchema,
  adminSubmissionsQuerySchema,
  type AdminSubmissionCode,
  type AdminSubmissionsFilters,
  type AdminSubmissionsResponse,
  aliasRequestSchema,
  type Feedback,
  feedbackSchema,
  type GameFeedback,
  gameFeedbackSchema,
  heartbeatRequestSchema,
  type Level,
  type LevelSummary,
  type MetricsResponse,
  metricsQuerySchema,
  type ProfileResponse,
  type Progress,
  type QueryResult,
  queryRequestSchema,
  type RunResult,
  runRequestSchema,
  type ScoreboardResponse,
  type SolversResponse,
  scoreboardQuerySchema,
  solversQuerySchema,
  type SubmissionRequest,
  type StatsResponse,
  type SubmissionResult,
  submissionRequestSchema,
} from "@uat/shared";
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { createMiddleware } from "hono/factory";
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
  listLevels: (userId: string) => Promise<LevelSummary[]>;
  isUnlocked: (userId: string, level: Level) => Promise<boolean>;
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
  wipeProgress: (userId: string) => Promise<void>;
  getFeedback: (userId: string, level: Level) => Promise<Feedback | null>;
  saveFeedback: (userId: string, level: Level, feedback: Feedback) => Promise<void>;
  sendGameFeedback: (userId: string, feedback: GameFeedback) => Promise<void>;
  heartbeat: (userId: string, level: Level, start: boolean) => Promise<void>;
};

/** The stats page, from `stats.ts`. */
export type StatsDependencies = {
  getStats: (userId: string) => Promise<StatsResponse>;
  getScoreboard: (userId: string, page: number) => Promise<ScoreboardResponse>;
  getSolvers: (userId: string, number: number) => Promise<SolversResponse>;
};

/** Admins and what only they may read, from `admin.ts`. */
export type AdminDependencies = {
  isAdmin: (userId: string) => Promise<boolean>;
  claim: (userId: string, token: string) => Promise<void>;
  getFeedback: () => Promise<AdminFeedbackResponse>;
  /** Queries, Runs and submissions per machine and per day, from `metrics.ts`. */
  getMetrics: (from: string, to: string) => Promise<MetricsResponse>;
  /** Every player's submissions, a page at a time, without code. */
  getSubmissions: (filters: AdminSubmissionsFilters) => Promise<AdminSubmissionsResponse>;
  /** One submission's code. */
  getSubmissionCode: (id: number) => Promise<AdminSubmissionCode>;
};

/** Save keys and aliases, from `profiles.ts`. (Loading a key is Better Auth's: see `auth.ts`.) */
export type ProfileDependencies = {
  getProfile: (userId: string) => Promise<ProfileResponse>;
  setAlias: (userId: string, alias: string) => Promise<void>;
  /** Admins only: rename the player who has the alias `from`. */
  renameAlias: (from: string, to: string) => Promise<void>;
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
  stats: StatsDependencies;
  admin: AdminDependencies;
  profiles: ProfileDependencies;
  /** Logs an error nobody expected and sends it to Sentry (`report.ts`). */
  reportError: (error: unknown) => void;
};

/**
 * The HTTP routes. Everything that needs Node (files, child processes, the
 * database) is passed in, so the web app can import `AppType` without pulling
 * in Node types.
 */
export function createApp({
  auth,
  levels,
  demo,
  game,
  stats,
  admin,
  profiles,
  reportError,
}: AppDependencies) {
  const requirePlayer = createMiddleware<{ Variables: Variables }>(async (c, next) => {
    const userId = await auth.getUserId(c.req.raw.headers);
    if (!userId) {
      return c.json({ error: "No session. Reload the page to start one." }, 401);
    }
    c.set("userId", userId);
    await next();
  });

  // After requirePlayer. Checked against the database on every request, so
  // only the server decides who is an admin.
  const requireAdmin = createMiddleware<{ Variables: Variables }>(async (c, next) => {
    if (!(await admin.isAdmin(c.get("userId")))) {
      return c.json({ error: "Admins only." }, 403);
    }
    await next();
  });

  const unlockedLevel = async (userId: string, number: string): Promise<Level> => {
    const level = levels.find((candidate) => String(candidate.number) === number);
    if (!level) throw new GameError(404, "No such level.");
    if (!(await game.isUnlocked(userId, level))) {
      throw new GameError(403, "That machine is locked. Solve the one before it first.");
    }
    return level;
  };

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
    .use("/levels", requirePlayer)
    .use("/progress", requirePlayer)
    // Wipe everything this player has done, on every level. Allowed in the
    // full game too: it resets solves along with penalties, so it cannot be
    // used to keep a solve and lose its penalty.
    .delete("/progress", async (c) => {
      await game.wipeProgress(c.get("userId"));
      return c.json({ ok: true as const }, 200);
    })
    // The stats page.
    .use("/stats", requirePlayer)
    .get("/stats", async (c) => c.json(await stats.getStats(c.get("userId")), 200))
    // Its scoreboard, a page at a time.
    .use("/scoreboard", requirePlayer)
    .get("/scoreboard", zValidator("query", scoreboardQuerySchema), async (c) =>
      c.json(await stats.getScoreboard(c.get("userId"), c.req.valid("query").page), 200),
    )
    // Everyone who solved one machine, for the stats page's solvers table.
    .use("/solvers", requirePlayer)
    .get("/solvers", zValidator("query", solversQuerySchema), async (c) =>
      c.json(await stats.getSolvers(c.get("userId"), c.req.valid("query").machine), 200),
    )
    .use("/me/*", requirePlayer)
    // Whether this player is an admin, so the browser knows what to show.
    .get("/me/admin", async (c) => c.json({ admin: await admin.isAdmin(c.get("userId")) }, 200))
    // The `?admin=` link: make this player an admin (and so leave them out of global stats).
    .post("/me/admin", zValidator("json", adminRequestSchema), async (c) => {
      await admin.claim(c.get("userId"), c.req.valid("json").token);
      return c.json({ ok: true as const }, 200);
    })
    // This player's save key (made the first time it is asked for) and alias.
    .get("/me/profile", async (c) => c.json(await profiles.getProfile(c.get("userId")), 200))
    // A new alias. Taken (in any case) answers 409.
    .put("/me/alias", zValidator("json", aliasRequestSchema), async (c) => {
      await profiles.setAlias(c.get("userId"), c.req.valid("json").alias);
      return c.json({ ok: true as const }, 200);
    })
    // Admins only: everything players have said.
    .use("/admin/*", requirePlayer, requireAdmin)
    .get("/admin/feedback", async (c) => c.json(await admin.getFeedback(), 200))
    // What players have been doing, per machine and per day.
    .get("/admin/metrics", zValidator("query", metricsQuerySchema), async (c) =>
      c.json(await admin.getMetrics(c.req.valid("query").from, c.req.valid("query").to), 200),
    )
    // Every player's submissions, newest first, filtered and a page at a time.
    .get("/admin/submissions", zValidator("query", adminSubmissionsQuerySchema), async (c) =>
      c.json(await admin.getSubmissions(c.req.valid("query")), 200),
    )
    // One submission's code, fetched when an admin opens it.
    .get("/admin/submissions/:id", zValidator("param", adminSubmissionParamSchema), async (c) =>
      c.json(await admin.getSubmissionCode(c.req.valid("param").id), 200),
    )
    // Rename another player, say one whose alias got past the rude-word check.
    // Unknown alias answers 404; taken, 409.
    .put("/admin/alias", zValidator("json", adminAliasRequestSchema), async (c) => {
      const { from, to } = c.req.valid("json");
      await profiles.renameAlias(from, to);
      return c.json({ ok: true as const }, 200);
    })
    // Feedback on the game as a whole, from the settings menu. A POST, not a
    // PUT: each one is a new message, never a replacement.
    .post("/me/feedback", zValidator("json", gameFeedbackSchema), async (c) => {
      await game.sendGameFeedback(c.get("userId"), c.req.valid("json"));
      return c.json({ ok: true as const }, 200);
    })
    .use("/levels/*", requirePlayer)
    // The level select: every level, with where this player stands on each.
    .get("/levels", async (c) =>
      c.json({ levels: await game.listLevels(c.get("userId")), demo }, 200),
    )
    // Every route below is about one level, which must exist and be unlocked
    // for this player. Checked here, not just greyed out in the browser.
    .use("/levels/:number/*", async (c, next) => {
      c.set("level", await unlockedLevel(c.get("userId"), c.req.param("number")));
      await next();
    })
    .get("/levels/:number", async (c) => {
      const level = await unlockedLevel(c.get("userId"), c.req.param("number"));
      const progress = await game.getProgress(c.get("userId"), level);
      // In demo mode `levels` holds only the demo's machine, so there is never a next one.
      return c.json({ level, progress, demo, hasNext: level.number < levels.length }, 200);
    })
    .post("/levels/:number/queries", zValidator("json", queryRequestSchema), async (c) =>
      c.json(await game.query(c.get("userId"), c.get("level"), c.req.valid("json").input), 200),
    )
    .post("/levels/:number/submissions", zValidator("json", submissionRequestSchema), async (c) =>
      c.json(await game.submit(c.get("userId"), c.get("level"), c.req.valid("json")), 200),
    )
    // "Still here", every 30 seconds while the level is open: time played.
    // A start beat comes on opening it, and on coming back to its tab.
    .post("/levels/:number/heartbeat", zValidator("json", heartbeatRequestSchema), async (c) => {
      await game.heartbeat(c.get("userId"), c.get("level"), c.req.valid("json").start);
      return c.json({ ok: true as const }, 200);
    })
    .post("/levels/:number/runs", zValidator("json", runRequestSchema), async (c) =>
      c.json(await game.run(c.get("userId"), c.get("level"), c.req.valid("json")), 200),
    )
    // A player's feedback on a level, solved or not: read it back, or send it.
    .get("/levels/:number/feedback", async (c) =>
      c.json({ feedback: await game.getFeedback(c.get("userId"), c.get("level")) }, 200),
    )
    .put("/levels/:number/feedback", zValidator("json", feedbackSchema), async (c) => {
      await game.saveFeedback(c.get("userId"), c.get("level"), c.req.valid("json"));
      return c.json({ ok: true as const }, 200);
    })
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
    // Anything else: the details go to the log and Sentry, never to the player.
    reportError(error);
    return c.json({ error: "Something went wrong on the server." }, 500);
  });

  return app;
}

/** The shape of the API, read by the web app's typed client (`hc<AppType>`). */
export type AppType = ReturnType<typeof createApp>;
