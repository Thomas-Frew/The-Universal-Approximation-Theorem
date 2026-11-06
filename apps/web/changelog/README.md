# Changelog entries

Each file here is one entry on the game's Changelog page (settings menu → Changelog), newest first.

- Name the file by its date: `2026-11-03.md`. For a second entry on the same day, add a suffix: `2026-11-03-2.md`. Files are sorted by name, so the date must come first. Files not starting with a date (like this one) are ignored.

- The first line is the title: `# Java, and Errors That Point at the Line` (title case). Optional.

- Each change is a line starting `- `. A line that does not start `- ` is a paragraph.

- `backticks` show as code. Nothing else is formatted.

- Players read this: write in the game's voice, and never hint at how a machine works.

The page is built in at build time (`apps/web/src/lib/changelog.ts`), so a new entry goes live with the next deploy.
