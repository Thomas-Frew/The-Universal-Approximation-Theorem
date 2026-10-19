import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { Hono } from "hono";
import { createApp } from "./app.ts";
import { createAuth } from "./auth.ts";
import { checkConnection, connect } from "./db/index.ts";
import { readConfig } from "./config.ts";
import { loadLevels, readManifest } from "./levels.ts";
import { createGame } from "./game.ts";
import { createJudge } from "./judge.ts";

const { levelsDir, cacheDir, databaseUrl, authSecret, authUrl, demo, debug, judge0Url, webDir } =
  readConfig();

// Checked before anything else: progress lives in Postgres, so without it
// the API should not start.
const db = connect(databaseUrl);
const postgresVersion = await checkConnection(db, databaseUrl);

// Bring the schema up to date before anything reads it. Already-applied
// migrations are skipped, so this is instant on every start but the first
// after a schema change, and a deploy never runs new code on an old schema.
await migrate(db, { migrationsFolder: resolve(import.meta.dirname, "..", "drizzle") });

// Levels are read and compiled once, at startup. A broken level stops the API
// from starting rather than failing later in front of a player.
// In demo mode the game is the one level `levels.yaml` names as `demo`. Only
// loading that one means the API cannot serve, query or judge any other,
// whatever the browser asks for.
const manifest = await readManifest(levelsDir);
if (demo && !manifest.demo) {
  throw new Error("DEMO_MODE is on, but levels.yaml has no `demo:` level.");
}
const slugs = demo && manifest.demo ? [manifest.demo] : manifest.levels;
const loaded = await loadLevels(levelsDir, cacheDir, slugs);
const port = Number(process.env.PORT ?? 8787);

const auth = createAuth(db, { secret: authSecret, baseURL: authUrl });
const game = createGame({
  db,
  levels: loaded,
  judge: judge0Url ? createJudge(loaded, judge0Url) : null,
  debug,
});

// Before taking requests: free anyone left mid-judging by the last shutdown.
const released = await game.releaseStuckSubmissions();
if (released > 0) console.log(`Released ${released} submission(s) left pending by the last run`);

const app = createApp({
  auth: {
    handler: (request) => auth.handler(request),
    getUserId: async (headers) => (await auth.api.getSession({ headers }))?.user.id ?? null,
  },
  levels: loaded.map(({ level }) => level),
  demo,
  game,
});

// The server: the API's routes, a health check for Dokploy, and in production
// the built web app, so the game and its API share one address (and the
// session cookie needs no cross-site setup). Locally Vite serves the web app.
const server = new Hono()
  .get("/healthz", (c) => c.text("ok"))
  .route("/", app);

if (webDir) {
  if (!existsSync(join(webDir, "index.html"))) {
    throw new Error(`WEB_DIR is ${webDir}, but there is no index.html there. Build the web app first.`);
  }
  const indexHtml = readFileSync(join(webDir, "index.html"), "utf8");
  server.use(
    "/assets/*",
    // Vite puts a content hash in every asset's name, so a file at a given
    // name never changes: browsers and Cloudflare may keep it for a year.
    async (c, next) => {
      await next();
      if (c.res.ok) c.header("Cache-Control", "public, max-age=31536000, immutable");
    },
  );
  server.use("/*", serveStatic({ root: webDir }));
  // Anything else is a page of the single-page app. Unknown /api paths are not.
  server.get("*", (c) =>
    c.req.path.startsWith("/api/") ? c.notFound() : c.html(indexHtml),
  );
}

serve({ fetch: server.fetch, port }, () => {
  console.log(`API on http://localhost:${port} with ${loaded.length} level(s)${demo ? " (demo mode)" : ""}`);
  console.log(`Connected to ${postgresVersion.split(" on ")[0]}`);
  console.log(judge0Url ? `Judging with Judge0 at ${judge0Url}` : "JUDGE0_URL is not set: submissions are off");
  if (webDir) console.log(`Serving the web app from ${webDir}`);
});
