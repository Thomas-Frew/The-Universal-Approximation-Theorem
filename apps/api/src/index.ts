import { resolve } from "node:path";
import { serve } from "@hono/node-server";
import { createApp } from "./app.ts";
import { loadLevels } from "./levels.ts";

const levelsDir = process.env.LEVELS_DIR;
if (!levelsDir) {
  throw new Error("Set LEVELS_DIR to a checkout of the levels repo (see .env.example).");
}

// Levels are read once, at startup. A broken level stops the API from starting
// rather than failing later in front of a player.
const levels = await loadLevels(resolve(levelsDir));
const port = Number(process.env.PORT ?? 8787);

serve({ fetch: createApp(levels).fetch, port }, () => {
  console.log(`API on http://localhost:${port} with ${levels.length} level(s)`);
});
