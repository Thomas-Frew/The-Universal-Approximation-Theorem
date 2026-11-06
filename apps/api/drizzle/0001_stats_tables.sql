CREATE TABLE "excluded_players" (
	"user_id" text PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "play_time" (
	"user_id" text NOT NULL,
	"level_id" uuid NOT NULL,
	"level_version" integer NOT NULL,
	"seconds" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "play_time_user_id_level_id_level_version_pk" PRIMARY KEY("user_id","level_id","level_version")
);
--> statement-breakpoint
ALTER TABLE "excluded_players" ADD CONSTRAINT "excluded_players_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "play_time" ADD CONSTRAINT "play_time_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;