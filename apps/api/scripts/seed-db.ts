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
 * Fills the local database with fake players, their play and their feedback,
 * so the level select, the stats page and the admin feedback views have
 * something to show. Run with `pnpm db:seed`.
 *
 *   pnpm db:seed               30 fake players
 *   pnpm db:seed --players 80  as many as you like
 *   pnpm db:seed --me          also give your own player (the newest real
 *                              one, i.e. the browser you opened last) a fake
 *                              history, replacing its progress
 *   pnpm db:seed --clear       remove the fake players, and nothing else
 *
 * One more fake player, `seed-complete`, solves every machine, so the
 * scoreboard shows a gold name.
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
        conceptDiff: config.concept_diff,
        implementDiff: config.implement_diff,
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
  feedback: Record<string, unknown>[];
  gameFeedback: Record<string, unknown>[];
};

/** A whole number from 1 to 8 near `centre`, as a rating would be. */
const rating = (centre: number, spread: number) =>
  Math.min(8, Math.max(1, Math.round(centre + (random() + random() - 1) * spread)));
/** Players leave parts of the form out, so each part is sometimes null. */
const maybe = <T>(value: T, chance: number) => (random() < chance ? value : null);
const pick = <T>(list: readonly T[]) => list[between(0, list.length - 1)]!;

// Comments say nothing about any machine's logic: the seeded rows are fake,
// but they are shown on the same pages as real ones.
const SOLVED_COMMENTS = [
  "Took me a while, but the moment it clicked was great.",
  "Spotted it after a handful of queries. Satisfying.",
  "Knew what it did long before I could write it.",
  "The edge cases got me twice. Fair, though.",
  "Lovely one.",
  "Easier than the card made it look.",
  "Wrote it in five minutes once I saw it.",
] as const;
const UNSOLVED_COMMENTS = [
  "No idea what this one does. Will come back.",
  "I think I know the rule but my code keeps failing.",
  "Ran out of patience. The outputs look random to me.",
  "Too hard for me right now.",
] as const;
const GAME_COMMENTS = [
  "Love the look of it. Feels like an old library.",
  "Great idea for a puzzle game. More machines please!",
  "The sounds are lovely.",
  "Would be nice to have a hint when I am stuck.",
  "Submissions are a bit slow sometimes.",
  "Go 1.13 has no generics, which caught me out.",
  "Really enjoying it so far.",
  "The penalty system makes me think before every query, which I like.",
  "Played it on my phone and it worked fine.",
] as const;

/**
 * One player's history: levels in play order, from a start time, until they
 * stop. `skill` (0 to 1) makes everything easier: fewer queries, fewer wrong
 * answers, less time, and more levels before giving up. With `finishAll`,
 * they solve every level and never stop.
 */
function playThrough(
  userId: string, levels: Level[], skill: number, start: Date, rows: Rows,
  { withFeedback = true, finishAll = false } = {},
) {
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
    const solved = finishAll || random() < solveChance;
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

    // About half say something about the machine, more often after solving
    // it. The difficulties follow the level's own, eased by skill; enjoyment
    // follows how it went.
    if (withFeedback && random() < (solved ? 0.55 : 0.3)) {
      const comment = random() < 0.4 ? pick(solved ? SOLVED_COMMENTS : UNSOLVED_COMMENTS) : "";
      const row = {
        user_id: userId, level_id: level.id, level_version: level.version,
        overall: maybe(rating(5 + (solved ? 1.5 : -1.5) - wrongs * 0.3, 2), 0.9),
        understanding: maybe(rating(level.conceptDiff + (0.6 - skill) * 3, 2), 0.75),
        implementation: maybe(rating(level.implementDiff + (0.6 - skill) * 3, 2), 0.7),
        comment, solved, created_at: new Date(clock), updated_at: new Date(clock),
      };
      // The form refuses an empty one, and so does the table.
      if (row.overall !== null || row.understanding !== null || row.implementation !== null || comment) {
        rows.feedback.push(row);
      }
    }

    // Most stop at the first machine they cannot solve; some move on after a
    // break. Stronger players keep going for longer.
    if (!finishAll && !solved && random() > 0.3) break;
    if (!finishAll && random() > 0.75 + skill * 0.22) break;
    tick(10, finishAll ? 240 : 600);
  }

  // Some write about the game as a whole, after they have played; a few come
  // back and write again, since each message is kept.
  if (withFeedback && random() < 0.35) {
    const messages = random() < 0.2 ? between(2, 3) : 1;
    for (let i = 0; i < messages; i++) {
      const comment = random() < 0.7 ? pick(GAME_COMMENTS) : "";
      const overall = maybe(rating(4.5 + skill * 3, 2), comment ? 0.6 : 1);
      rows.gameFeedback.push({ user_id: userId, overall, comment, created_at: tick(5, 2000) });
    }
  }
}

const sql = postgres(url, { onnotice: () => {} });
try {
  const removed = await sql`delete from "user" where id like 'seed-%' returning id`;
  if (args.clear) {
    console.log(`Removed ${removed.length} fake players and everything they did.`);
  } else {
    const levels = await readLevels();
    const rows: Rows = { observations: [], submissions: [], playTime: [], feedback: [], gameFeedback: [] };
    const now = Date.now();
    const twoWeeks = 14 * 24 * 60 * 60 * 1000;

    const fakeUser = (id: string, name: string, createdAt: Date) => ({
      id, name, email: `${id}@seed.invalid`,
      email_verified: false, is_anonymous: true, created_at: createdAt, updated_at: createdAt,
    });
    const users = Array.from({ length: playerCount }, (_, index) =>
      fakeUser(`seed-${index + 1}`, `Seed player ${index + 1}`, new Date(now - twoWeeks + random() * twoWeeks * 0.9)),
    );
    // A strong player from the very start, with shorter breaks, so all of
    // the machines fit in the two weeks.
    const completer = fakeUser("seed-complete", "Seed completer", new Date(now - twoWeeks));
    const fakes = [...users, completer];
    await sql`insert into "user" ${sql(fakes)}`;
    for (const user of users) playThrough(user.id, levels, 0.3 + random() * 0.7, user.created_at, rows);
    playThrough(completer.id, levels, 0.95, completer.created_at, rows, { finishAll: true });

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
        // No fake feedback: feedback is not progress, and theirs may be real.
        playThrough(me, levels, 0.85, new Date(now - twoWeeks), rows, { withFeedback: false });
      }
    }

    // One transaction, so a failure leaves nothing half-seeded.
    await sql.begin(async (tx) => {
      for (const [table, list] of [
        ["observations", rows.observations],
        ["submissions", rows.submissions],
        ["play_time", rows.playTime],
        ["feedback", rows.feedback],
        ["game_feedback", rows.gameFeedback],
      ] as const) {
        // Postgres takes at most 65535 parameters per statement, so go in batches.
        for (let i = 0; i < list.length; i += 1000) {
          await tx`insert into ${tx(table)} ${tx(list.slice(i, i + 1000) as Record<string, unknown>[])}`;
        }
      }
    });

    const solved = rows.submissions.filter((row) => row.verdict === "accepted").length;
    console.log(
      `Seeded ${playerCount} fake players, and one who solved everything, over ${levels.length} levels: ` +
        `${rows.observations.length} observations, ${rows.submissions.length} submissions (${solved} solves), ` +
        `${rows.feedback.length} machine feedbacks and ${rows.gameFeedback.length} game feedbacks.`,
    );
    if (removed.length > 0) console.log(`Replaced the ${removed.length} fake players from the last run.`);
    if (me) console.log(`Gave your player (${me}) a fake history too. Reload the game to see it.`);
    console.log("Global stats are cached for a minute, so give the stats page a moment, or restart the API.");
  }
} finally {
  await sql.end();
}
