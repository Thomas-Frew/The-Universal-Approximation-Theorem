import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { problemConfigSchema } from "@uat/shared";
import postgres from "postgres";
import { parse as parseYaml } from "yaml";
import { readLevelsConfig } from "../src/config.ts";
import { readManifest } from "../src/levels.ts";

/**
 * Fills the local database with fake players and their play, so the level
 * select and the stats page have something to show. Run with `pnpm db:seed`.
 *
 *   pnpm db:seed               30 fake players
 *   pnpm db:seed --players 80  as many as you like
 *   pnpm db:seed --me          also give your own player (the newest real
 *                              one, i.e. the browser you opened last) a fake
 *                              history, replacing its progress
 *   pnpm db:seed --clear       remove the fake players, and nothing else
 *
 * Fake players have ids starting `seed-`, so running it again replaces them
 * rather than adding more. Random choices come from a fixed seed, so every
 * run makes the same data. Like db:reset, it refuses any database not on
 * this machine.
 *
 * Every row gets an explicit time, spread over the last two weeks, because
 * the game reads meaning from order: penalty freezes at the first accepted
 * submission, and the first solver of a machine is the earliest.
 */

const { values: args } = parseArgs({
  options: {
    players: { type: "string", default: "30" },
    me: { type: "boolean", default: false },
    clear: { type: "boolean", default: false },
  },
});
const playerCount = Number(args.players);
if (!Number.isInteger(playerCount) || playerCount < 1) {
  console.error("--players must be a whole number above 0.");
  process.exit(1);
}

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("Set DATABASE_URL in apps/api/.env (see .env.example).");
  process.exit(1);
}
const host = new URL(url).hostname;
if (!["localhost", "127.0.0.1", "::1"].includes(host)) {
  console.error(`Refusing to seed ${host}: db:seed only writes to a local database.`);
  process.exit(1);
}

/** Small, fast, seedable random numbers (mulberry32), so every run is the same. */
function randomFrom(seed: number) {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const random = randomFrom(20261021);
const between = (low: number, high: number) => low + Math.floor(random() * (high - low + 1));
const hash = (text: string) => createHash("sha256").update(text).digest("hex");

/** The levels in play, as the game will see them: id, version and difficulty. */
async function readLevels() {
  const { levelsDir } = readLevelsConfig();
  const manifest = await readManifest(levelsDir);
  const slugs = manifest.levels;
  return Promise.all(
    slugs.map(async (slug) => {
      const config = problemConfigSchema.parse(
        parseYaml(await readFile(join(levelsDir, "levels", slug, "problem.yaml"), "utf8")),
      );
      return {
        id: config.uuid,
        version: config.version,
        title: config.name,
        difficulty: Math.max(config.concept_diff, config.implement_diff),
      };
    }),
  );
}

type Level = Awaited<ReturnType<typeof readLevels>>[number];

type Rows = {
  observations: Record<string, unknown>[];
  submissions: Record<string, unknown>[];
  playTime: Record<string, unknown>[];
};

/**
 * One player's history: levels in play order, from a start time, until they
 * stop. `skill` (0 to 1) makes everything easier: fewer queries, fewer wrong
 * answers, less time, and more levels before giving up.
 */
function playThrough(userId: string, levels: Level[], skill: number, start: Date, rows: Rows) {
  let clock = start.getTime();
  const tick = (minLow: number, minHigh: number) => {
    clock += between(minLow, minHigh) * 60_000;
    return new Date(clock);
  };
  const languages = ["cpp", "python", "go"] as const;
  const language = languages[between(0, 2)]!;

  for (const level of levels) {
    // Harder machines, and weaker players, mean more of everything.
    const hardness = level.difficulty / 8;
    const queries = Math.round(random() * (1 + level.difficulty * 2) * (1.4 - skill));
    const solveChance = 0.95 - hardness * 0.6 + skill * 0.3;
    const solved = random() < solveChance;
    const wrongs = Math.min(6, Math.floor(-Math.log(1 - random()) * hardness * (1.6 - skill) * 2));
    const startedAt = clock;

    for (let i = 0; i < queries; i++) {
      const input = `seed ${i + 1}`;
      rows.observations.push({
        user_id: userId, level_id: level.id, level_version: level.version,
        input: `${input}\n`, input_hash: hash(`${input}\n`), output: "(seeded)\n",
        source: "query", created_at: tick(1, 4),
      });
    }
    for (let i = 0; i < wrongs; i++) {
      const at = tick(2, 10);
      rows.submissions.push({
        user_id: userId, level_id: level.id, level_version: level.version, language,
        code: "// seeded", verdict: ["wrong_answer", "wrong_answer", "runtime_error", "time_limit"][between(0, 3)],
        created_at: at, judged_at: at,
      });
      // A wrong answer reveals a hidden case, as in the real game.
      const input = `seed revealed ${i + 1}`;
      rows.observations.push({
        user_id: userId, level_id: level.id, level_version: level.version,
        input: `${input}\n`, input_hash: hash(`${input}\n`), output: "(seeded)\n",
        source: "revealed", created_at: at,
      });
    }
    if (solved) {
      const at = tick(2, 10);
      rows.submissions.push({
        user_id: userId, level_id: level.id, level_version: level.version, language,
        code: "// seeded", verdict: "accepted", created_at: at, judged_at: at,
      });
    }
    // Time with the level open, in heartbeat steps of 30 seconds.
    const seconds = Math.max(30, Math.round(((clock - startedAt) / 1000) * (1 + random()) / 30) * 30);
    rows.playTime.push({
      user_id: userId, level_id: level.id, level_version: level.version, seconds, updated_at: new Date(clock),
    });

    // Most stop at the first machine they cannot solve; some move on after a
    // break. Stronger players keep going for longer.
    if (!solved && random() > 0.3) break;
    if (random() > 0.75 + skill * 0.22) break;
    tick(10, 600);
  }
}

const sql = postgres(url, { onnotice: () => {} });
try {
  const removed = await sql`delete from "user" where id like 'seed-%' returning id`;
  if (args.clear) {
    console.log(`Removed ${removed.length} fake players and everything they did.`);
  } else {
    const levels = await readLevels();
    const rows: Rows = { observations: [], submissions: [], playTime: [] };
    const now = Date.now();
    const twoWeeks = 14 * 24 * 60 * 60 * 1000;

    const users = Array.from({ length: playerCount }, (_, index) => {
      const n = index + 1;
      const createdAt = new Date(now - twoWeeks + random() * twoWeeks * 0.9);
      return {
        id: `seed-${n}`, name: `Seed player ${n}`, email: `seed-${n}@seed.invalid`,
        email_verified: false, is_anonymous: true, created_at: createdAt, updated_at: createdAt,
      };
    });
    await sql`insert into "user" ${sql(users)}`;
    for (const user of users) playThrough(user.id, levels, 0.3 + random() * 0.7, user.created_at, rows);

    let me: string | null = null;
    if (args.me) {
      // The browser you opened last made the newest real player.
      const [newest] = await sql<{ id: string }[]>`
        select id from "user" where id not like 'seed-%' order by created_at desc limit 1
      `;
      if (!newest) {
        console.log("No real player yet: open the game in a browser first, then run with --me again.");
      } else {
        me = newest.id;
        await sql`delete from observations where user_id = ${me}`;
        await sql`delete from submissions where user_id = ${me}`;
        await sql`delete from play_time where user_id = ${me}`;
        // A strong player who started early, so they hold some first solves.
        playThrough(me, levels, 0.85, new Date(now - twoWeeks), rows);
      }
    }

    // One transaction, so a failure leaves nothing half-seeded.
    await sql.begin(async (tx) => {
      for (const [table, list] of [
        ["observations", rows.observations],
        ["submissions", rows.submissions],
        ["play_time", rows.playTime],
      ] as const) {
        // Postgres takes at most 65535 parameters per statement, so go in batches.
        for (let i = 0; i < list.length; i += 1000) {
          await tx`insert into ${tx(table)} ${tx(list.slice(i, i + 1000) as Record<string, unknown>[])}`;
        }
      }
    });

    const solved = rows.submissions.filter((row) => row.verdict === "accepted").length;
    console.log(
      `Seeded ${playerCount} fake players over ${levels.length} levels: ` +
        `${rows.observations.length} observations, ${rows.submissions.length} submissions (${solved} solves).`,
    );
    if (removed.length > 0) console.log(`Replaced the ${removed.length} fake players from the last run.`);
    if (me) console.log(`Gave your player (${me}) a fake history too. Reload the game to see it.`);
    console.log("Global stats are cached for a minute, so give the stats page a moment, or restart the API.");
  }
} finally {
  await sql.end();
}
