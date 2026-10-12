import { serve } from "@hono/node-server";
import { createApp } from "./app.ts";
import { readConfig } from "./config.ts";
import { loadLevels } from "./levels.ts";
import { createQueryRunner } from "./query.ts";

const { levelsDir, cacheDir, debug } = readConfig();

// Levels are read and compiled once, at startup. A broken level stops the API
// from starting rather than failing later in front of a player.
const loaded = await loadLevels(levelsDir, cacheDir);
const port = Number(process.env.PORT ?? 8787);

const app = createApp({
  levels: loaded.map(({ level }) => level),
  runQuery: createQueryRunner(loaded, { debug }),
});

serve({ fetch: app.fetch, port }, () => {
  console.log(`API on http://localhost:${port} with ${loaded.length} level(s)`);
});
