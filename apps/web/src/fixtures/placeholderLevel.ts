import type { Level } from "@uat/shared";

/**
 * Stand-in for the first level until the API serves real ones from the levels
 * repo. Delete this file once the level screen fetches its data.
 */
export const placeholderLevel: Level = {
  id: "00000000-0000-4000-8000-000000000001",
  slug: "placeholder",
  version: 1,
  number: 1,
  title: "The Placeholder Machine",
  inputFormat: "A single line with one integer n, between 1 and 1000.",
  outputFormat: "A single line with one integer.",
  samples: [
    { input: "3\n", output: "6\n" },
    { input: "10\n", output: "20\n" },
  ],
};
