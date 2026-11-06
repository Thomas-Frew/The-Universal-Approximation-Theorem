/**
 * The Changelog page's entries: one Markdown file each in `apps/web/changelog/`,
 * named by date (see the README there). Vite reads them all as text when it
 * builds, so the page needs no request and an entry goes live on the next
 * deploy.
 */
const files = import.meta.glob<string>("../../changelog/*.md", { query: "?raw", import: "default", eager: true });

export type ChangelogBlock = { kind: "item" | "paragraph"; text: string };

export type ChangelogEntry = {
  /** The file's name without `.md`, unique, for React's key. */
  id: string;
  /** The day, `YYYY-MM-DD`, from the start of the file's name. */
  date: string;
  title: string | null;
  blocks: ChangelogBlock[];
};

const DATED_NAME = /(\d{4}-\d{2}-\d{2})[^/]*\.md$/;

function parse(id: string, date: string, text: string): ChangelogEntry {
  let title: string | null = null;
  const blocks: ChangelogBlock[] = [];
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (!line) continue;
    if (line.startsWith("# ") && title === null && blocks.length === 0) title = line.slice(2).trim();
    else if (line.startsWith("- ")) blocks.push({ kind: "item", text: line.slice(2).trim() });
    else blocks.push({ kind: "paragraph", text: line });
  }
  return { id, date, title, blocks };
}

/** Every entry, newest first (by file name, so a `-2` file sits above its day's first). */
export const CHANGELOG: ChangelogEntry[] = Object.entries(files)
  .flatMap(([path, text]) => {
    const match = DATED_NAME.exec(path);
    if (!match) return [];
    const id = path.slice(path.lastIndexOf("/") + 1, -".md".length);
    return [parse(id, match[1]!, text)];
  })
  .sort((a, b) => b.id.localeCompare(a.id));

/** "3 November 2026", read as a calendar day, whatever the player's time zone. */
export function formatChangelogDate(date: string): string {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}
