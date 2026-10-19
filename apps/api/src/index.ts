import { serve } from "@hono/node-server";
import { createApp } from "./app.ts";
import { createAuth } from "./auth.ts";
import { checkConnection, connect } from "./db/index.ts";
import { readConfig } from "./config.ts";
import { loadLevels } from "./levels.ts";
import { createGame } from "./game.ts";
import { createJudge } from "./judge.ts";

const { levelsDir, cacheDir, databaseUrl, authSecret, authUrl, debug, judge0Url } = readConfig();

// Checked before anything else: progress lives in Postgres, so without it
// the API should not start.
const db = connect(databaseUrl);
const postgresVersion = await checkConnection(db);

// Levels are read and compiled once, at startup. A broken level stops the API
// from starting rather than failing later in front of a player.
const loaded = await loadLevels(levelsDir, cacheDir);
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
  game,
});

serve({ fetch: app.fetch, port }, () => {
  console.log(`API on http://localhost:${port} with ${loaded.length} level(s)`);
  console.log(`Connected to ${postgresVersion.split(" on ")[0]}`);
  console.log(judge0Url ? `Judging with Judge0 at ${judge0Url}` : "JUDGE0_URL is not set: submissions are off");
});
