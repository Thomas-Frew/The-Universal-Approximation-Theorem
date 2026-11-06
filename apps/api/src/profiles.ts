import { randomBytes } from "node:crypto";
import { formatSaveKey, normaliseSaveKey, type ProfileResponse, SAVE_KEY_ALPHABET, SAVE_KEY_LENGTH } from "@uat/shared";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import type { Database } from "./db/index.ts";
import { observations, playerProfiles, submissions } from "./db/schema.ts";
import { GameError } from "./errors.ts";
import { isUniqueViolation } from "./game.ts";

/**
 * Save keys and aliases (the `player_profiles` table).
 *
 * A save key moves a player between browsers: `auth.ts` has the endpoint that
 * signs a browser in as the key's player. Nothing about progress changes;
 * the browser simply becomes that player, with all of their rows.
 *
 * Every player has an alias from the moment their profile is made: one is
 * made up for them, and they can change it but not remove it. The column is
 * nullable only because the first profiles predate this; any found without
 * one get one when next read.
 */

/**
 * 16 random characters from the 32-letter alphabet: 80 bits, far beyond
 * guessing. 256 is a multiple of 32, so taking each byte modulo 32 keeps
 * every character equally likely.
 */
function newSaveKey(): string {
  return [...randomBytes(SAVE_KEY_LENGTH)].map((byte) => SAVE_KEY_ALPHABET[byte % 32]).join("");
}

// A made-up alias is a very fancy word and an animal: Serendipitous Owl,
// Elegant Lynx, Civilised Cockatiel. 40 of each, 1 600 pairs. The longest
// pair is 24 characters, so with a number on the end it still fits
// MAX_ALIAS_LENGTH (30).
const FANCY_WORDS = [
  "Ambrosial",
  "August",
  "Affable",
  "Beautiful",
  "Benevolent",
  "Bucolic",
  "Cerulean",
  "Chivalrous",
  "Convivial",
  "Cosmopolitan",
  "Courtly",
  "Dashing",
  "Dauntless",
  "Decorous",
  "Diaphanous",
  "Distinguished",
  "Dulcet",
  "Efflorescent",
  "Effortless",
  "Enigmatic",
  "Equanimous",
  "Ethereal",
  "Exquisite",
  "Exuberant",
  "Felicitous",
  "Fervent",
  "Gilded",
  "Gossamer",
  "Gregarious",
  "Idyllic",
  "Imperturbable",
  "Incandescent",
  "Indefatigable",
  "Ingenious",
  "Inspired",
  "Insouciant",
  "Intrepid",
  "Iridescent",
  "Invincibile",
  "Jaunty",
  "Jocund",
  "Jovial",
  "Kaleidoscopic",
  "Laconic",
  "Lambent",
  "Limpid",
  "Lissome",
  "Loquacious",
  "Lyrical",
  "Magnanimous",
  "Magnificent",
  "Majestic",
  "Mercurial",
  "Mirthful",
  "Noble",
  "Numinous",
  "Oracular",
  "Ornate",
  "Opulent",
  "Palatial",
  "Paragonical",
  "Pellucid",
  "Peripatetic",
  "Plucky",
  "Pristine",
  "Prodigious",
  "Puckish",
  "Quintessential",
  "Radiant",
  "Rapturous",
  "Reputable",
  "Recondite",
  "Redoubtable",
  "Regal",
  "Resolute",
  "Sanguine",
  "Sardonic",
  "Sartorial",
  "Sedulous",
  "Seraphic",
  "Serene",
  "Sonorous",
  "Sprightly",
  "Stately",
  "Stellar",
  "Suave",
  "Sumptuous",
  "Tenacious",
  "Tipsy",
  "Tranquil",
  "Undaunted",
  "Unflappable",
  "Valiant",
  "Velvety",
  "Verdant",
  "Vibrant",
  "Virtuous",
  "Voracious",
  "Xenial",
  "Zephyrean",
  "Zestful",
];

const BIRDS = [
  "Albatross",
  "Avocet",
  "Bittern",
  "Bowerbird",
  "Bunting",
  "Cassowary",
  "Cockatiel",
  "Cockatoo",
  "Condor",
  "Cormorant",
  "Crane",
  "Curlew",
  "Dotterel",
  "Egret",
  "Falcon",
  "Finch",
  "Flamingo",
  "Galah",
  "Goldcrest",
  "Goshawk",
  "Grebe",
  "Harrier",
  "Heron",
  "Hornbill",
  "Hummingbird",
  "Ibis",
  "Jacana",
  "Jay",
  "Kakapo",
  "Kea",
  "Kestrel",
  "Kingfisher",
  "Kite",
  "Kiwi",
  "Kookaburra",
  "Lapwing",
  "Lark",
  "Lorikeet",
  "Lyrebird",
  "Macaw",
  "Magpie",
  "Merlin",
  "Nightingale",
  "Nightjar",
  "Nuthatch",
  "Oriole",
  "Osprey",
  "Owl",
  "Peafowl",
  "Pelican",
  "Peregrine",
  "Pheasant",
  "Plover",
  "Puffin",
  "Quail",
  "Quetzal",
  "Raven",
  "Robin",
  "Rosella",
  "Sandpiper",
  "Shrike",
  "Skylark",
  "Sparrowhawk",
  "Spoonbill",
  "Starling",
  "Stork",
  "Swallow",
  "Swan",
  "Swift",
  "Tanager",
  "Tern",
  "Toucan",
  "Trogon",
  "Turaco",
  "Umbrellabird",
  "Vireo",
  "Wagtail",
  "Warbler",
  "Waxwing",
  "Woodpecker",
  "Wren",
  "Xenops",
  "Yellowhammer",
];

/** A random fancy word and bird, with a number from 100 to 999 after them if asked. */
function madeUpAlias(withNumber: boolean): string {
  const pick = (list: string[]) => list[randomBytes(2).readUInt16BE() % list.length]!;
  const name = `${pick(FANCY_WORDS)} ${pick(BIRDS)}`;
  return withNumber ? `${name} ${100 + (randomBytes(2).readUInt16BE() % 900)}` : name;
}

/**
 * Runs a write that sets a made-up alias (and a new key, if it makes one),
 * trying again with fresh ones while either clashes with someone else's.
 * The first tries are plain pairs; once those keep clashing (as they will
 * when most of the 1 600 are taken) a number goes on the end, so names never
 * run out.
 */
async function withFreshNames(write: (names: { alias: string; saveKey: string }) => Promise<void>): Promise<void> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await write({ alias: madeUpAlias(attempt > 10), saveKey: newSaveKey() });
    } catch (error) {
      if (!isUniqueViolation(error) || attempt === 30) throw error;
    }
  }
}

export function createProfiles({ db, onAliasChange }: {
  db: Database;
  /** Called when a player's alias changes, so the scoreboard is counted again. */
  onAliasChange: () => void;
}) {
  const select = (userId: string) =>
    db
      .select({ saveKey: playerProfiles.saveKey, alias: playerProfiles.alias })
      .from(playerProfiles)
      .where(eq(playerProfiles.userId, userId));

  /** This player's row, made with a fresh key and alias the first time it is needed. */
  async function ensureRow(userId: string): Promise<{ saveKey: string; alias: string }> {
    const [existing] = await select(userId);
    if (!existing) {
      // Two first visits at once (two tabs) may both get here: the second
      // insert does nothing, and both read back the one row that won.
      await withFreshNames(({ alias, saveKey }) =>
        db
          .insert(playerProfiles)
          .values({ userId, saveKey, alias })
          .onConflictDoNothing({ target: playerProfiles.userId })
          .then(() => undefined),
      );
    } else if (existing.alias === null) {
      await withFreshNames(({ alias }) =>
        db
          .update(playerProfiles)
          .set({ alias })
          .where(and(eq(playerProfiles.userId, userId), isNull(playerProfiles.alias)))
          .then(() => undefined),
      );
    }
    const [row] = await select(userId);
    if (!row?.alias) throw new Error(`Could not make a profile for ${userId}`);
    return { saveKey: row.saveKey, alias: row.alias };
  }

  async function getProfile(userId: string): Promise<ProfileResponse> {
    const [row, [played]] = await Promise.all([
      ensureRow(userId),
      db.execute<{ played: boolean }>(
        sql`select exists (select 1 from ${observations} where ${observations.userId} = ${userId})
              or exists (select 1 from ${submissions} where ${submissions.userId} = ${userId}) as played`,
      ),
    ]);
    return { key: formatSaveKey(row.saveKey), alias: row.alias, hasProgress: Boolean(played?.played) };
  }

  /** Changes the alias. Already checked by `aliasSchema`. */
  async function setAlias(userId: string, alias: string): Promise<void> {
    await ensureRow(userId);
    try {
      await db
        .update(playerProfiles)
        .set({ alias, updatedAt: new Date() })
        .where(eq(playerProfiles.userId, userId));
    } catch (error) {
      // The unique index on lower(alias): someone already has it, in any case.
      if (isUniqueViolation(error)) throw new GameError(409, "That alias is taken.");
      throw error;
    }
    onAliasChange();
  }

  /**
   * An admin renaming another player, found by their current alias (in any
   * case). The new alias has passed `aliasSchema`, rude-word check included.
   */
  async function renameAlias(from: string, to: string): Promise<void> {
    try {
      const renamed = await db
        .update(playerProfiles)
        .set({ alias: to, updatedAt: new Date() })
        .where(sql`lower(${playerProfiles.alias}) = lower(${from})`)
        .returning({ userId: playerProfiles.userId });
      if (renamed.length === 0) throw new GameError(404, "No player has that alias.");
    } catch (error) {
      if (isUniqueViolation(error)) throw new GameError(409, "That alias is taken.");
      throw error;
    }
    onAliasChange();
  }

  /** The player a typed key belongs to, or null if it is no one's (or not a key at all). */
  async function findPlayerByKey(typed: string): Promise<string | null> {
    const key = normaliseSaveKey(typed);
    if (!key) return null;
    const [row] = await db
      .select({ userId: playerProfiles.userId })
      .from(playerProfiles)
      .where(eq(playerProfiles.saveKey, key));
    return row?.userId ?? null;
  }

  /**
   * Every one of these players' aliases, for the scoreboard. A player who has
   * never opened the save page has no profile yet, so one is made for them
   * here, made-up alias and all: everyone on the board has a name.
   */
  async function aliasesOf(userIds: string[]): Promise<Map<string, string>> {
    if (userIds.length === 0) return new Map();
    const rows = await db
      .select({ userId: playerProfiles.userId, alias: playerProfiles.alias })
      .from(playerProfiles)
      .where(inArray(playerProfiles.userId, userIds));
    const aliases = new Map(rows.flatMap((row) => (row.alias ? [[row.userId, row.alias] as const] : [])));
    for (const userId of userIds) {
      if (!aliases.has(userId)) aliases.set(userId, (await ensureRow(userId)).alias);
    }
    return aliases;
  }

  return { getProfile, setAlias, renameAlias, findPlayerByKey, aliasesOf };
}

export type Profiles = ReturnType<typeof createProfiles>;
