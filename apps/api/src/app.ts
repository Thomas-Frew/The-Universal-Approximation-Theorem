import type { Level } from "@uat/shared";
import { Hono } from "hono";

/**
 * The HTTP routes. Takes the loaded levels as an argument and touches no Node
 * APIs itself, so the web app can import `AppType` without pulling in Node types.
 */
export function createApp(levels: readonly Level[]) {
  return new Hono().basePath("/api").get("/levels/:number", (c) => {
    const level = levels.find(
      (candidate) => String(candidate.number) === c.req.param("number"),
    );
    if (!level) {
      return c.json({ error: "No such level." }, 404);
    }
    return c.json(level, 200);
  });
}

/** The shape of the API, read by the web app's typed client (`hc<AppType>`). */
export type AppType = ReturnType<typeof createApp>;
