import { z } from "zod";
import { isRude } from "./rude.ts";

/**
 * Save keys and aliases.
 *
 * A save key carries a player from one browser to another: entering it signs
 * the browser in as that player. It is 16 characters from Crockford's base-32
 * alphabet (digits and capitals without I, L, O and U, so nothing can be
 * misread), 80 random bits, shown in groups of four: `7K3M-QW9X-2HDE-R5TA`.
 * Typed keys are forgiving: case, spaces and dashes are ignored, and the
 * letters people confuse with digits (I, L, O) are read as those digits.
 */
export const SAVE_KEY_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
export const SAVE_KEY_LENGTH = 16;

/** A typed key in its stored form (16 characters, no dashes), or null if it cannot be one. */
export function normaliseSaveKey(typed: string): string | null {
  const key = typed
    .toUpperCase()
    .replace(/[\s-]/g, "")
    .replace(/[IL]/g, "1")
    .replace(/O/g, "0");
  if (key.length !== SAVE_KEY_LENGTH) return null;
  return [...key].every((char) => SAVE_KEY_ALPHABET.includes(char)) ? key : null;
}

/** A stored key as players see it: four groups of four. */
export function formatSaveKey(key: string): string {
  return key.match(/.{1,4}/g)?.join("-") ?? key;
}

export const MIN_ALIAS_LENGTH = 2;
export const MAX_ALIAS_LENGTH = 30;

/**
 * A player's name on the scoreboard. Every player has one from the start, made
 * up for them (`Serendipitous Owl`), and can change it but not remove it, so
 * no name is ever free for someone else to pass themselves off as you.
 * Letters, digits, spaces and . _ ' -, starting with a letter or digit; runs
 * of spaces become one. No rude words (`rude.ts`). Unique regardless of case
 * (checked by the database).
 */
export const aliasSchema = z
  .string()
  .transform((alias) => alias.trim().replace(/\s+/g, " "))
  .pipe(
    z
      .string()
      .min(MIN_ALIAS_LENGTH, `An alias needs at least ${MIN_ALIAS_LENGTH} characters.`)
      .max(MAX_ALIAS_LENGTH, `An alias can have at most ${MAX_ALIAS_LENGTH} characters.`)
      .regex(/^[A-Za-z0-9][A-Za-z0-9 ._'-]*$/, "Use letters, digits, spaces and . _ ' -, starting with a letter or digit.")
      .refine((alias) => !isRude(alias), "That alias is not allowed."),
  );

/** `PUT /me/alias`: a new alias. */
export const aliasRequestSchema = z.object({ alias: aliasSchema });

/** `GET /me/profile`: this player's save key and alias. */
export const profileResponseSchema = z.object({
  /** Formatted, with dashes. */
  key: z.string(),
  alias: z.string(),
  /** Whether this player has played anything, so loading another key would leave it behind. */
  hasProgress: z.boolean(),
});
export type ProfileResponse = z.infer<typeof profileResponseSchema>;

/** The request to sign this browser in as the player a key belongs to. */
export const loadKeyRequestSchema = z.object({ key: z.string().max(64) });
