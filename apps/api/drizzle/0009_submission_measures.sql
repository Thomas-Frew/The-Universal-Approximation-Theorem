ALTER TABLE "submissions" ADD COLUMN "time_ms" integer;--> statement-breakpoint
ALTER TABLE "submissions" ADD COLUMN "memory_kb" integer;--> statement-breakpoint
ALTER TABLE "submissions" ADD COLUMN "failed_test" integer;