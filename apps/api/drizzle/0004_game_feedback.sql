CREATE TABLE "game_feedback" (
	"user_id" text PRIMARY KEY NOT NULL,
	"overall" integer,
	"comment" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "game_feedback_overall_range" CHECK ("game_feedback"."overall" between 1 and 8),
	CONSTRAINT "game_feedback_not_empty" CHECK ("game_feedback"."overall" is not null or "game_feedback"."comment" <> '')
);
--> statement-breakpoint
ALTER TABLE "game_feedback" ADD CONSTRAINT "game_feedback_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;