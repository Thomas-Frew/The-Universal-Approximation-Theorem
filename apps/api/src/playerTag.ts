import { createHash } from "node:crypto";

/**
 * A short tag for a player that stays the same for them but does not show
 * their id: the first six hex digits of its SHA-256. Used wherever players
 * are told apart without a name (admin feedback, anonymous scoreboard rows).
 */
export const tagOf = (userId: string) => createHash("sha256").update(userId).digest("hex").slice(0, 6);
