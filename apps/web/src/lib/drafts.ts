import { languageSchema } from "@uat/shared";
import { z } from "zod";

/**
 * The editor's unsent code, one draft per language, remembered per level in
 * this browser, so leaving a level (for the menu, or the feedback page) and
 * coming back keeps it. A UI convenience, so localStorage is the right place;
 * keyed by the level's uuid, so reordering levels cannot mix drafts up.
 */
const draftsSchema = z.object({
  language: languageSchema,
  drafts: z.record(languageSchema, z.string()),
});
export type Drafts = z.infer<typeof draftsSchema>;

const keyFor = (levelId: string) => `uat:drafts:${levelId}`;

/** The saved drafts, or null if there are none or they cannot be read. */
export function readDrafts(levelId: string): Drafts | null {
  try {
    const saved = localStorage.getItem(keyFor(levelId));
    if (saved === null) return null;
    // Checked like anything else from outside: an old or edited entry is ignored.
    const parsed = draftsSchema.safeParse(JSON.parse(saved));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export function saveDrafts(levelId: string, drafts: Drafts): void {
  try {
    localStorage.setItem(keyFor(levelId), JSON.stringify(drafts));
  } catch {
    // Storage full or blocked: the draft lives only as long as the page.
  }
}

export function clearDrafts(levelId: string): void {
  try {
    localStorage.removeItem(keyFor(levelId));
  } catch {
    // Nothing to clear.
  }
}
