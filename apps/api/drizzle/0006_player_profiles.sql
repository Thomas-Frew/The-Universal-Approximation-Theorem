CREATE TABLE "player_profiles" (
	"user_id" text PRIMARY KEY NOT NULL,
	"save_key" text NOT NULL,
	"alias" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "player_profiles_save_key_unique" UNIQUE("save_key")
);
--> statement-breakpoint
ALTER TABLE "player_profiles" ADD CONSTRAINT "player_profiles_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "player_profiles_alias_idx" ON "player_profiles" USING btree (lower("alias"));