import { existsSync } from "node:fs";
import { defineConfig } from "drizzle-kit";

// drizzle-kit does not read .env by itself.
if (existsSync(".env")) process.loadEnvFile(".env");

/**
 * drizzle-kit compares `src/db/schema.ts` with the migrations already in
 * `drizzle/` and writes the SQL for the difference (`pnpm db:generate`), then
 * applies migrations the database has not seen yet (`pnpm db:migrate`).
 */
export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dbCredentials: { url: process.env.DATABASE_URL ?? "" },
  strict: true,
});
