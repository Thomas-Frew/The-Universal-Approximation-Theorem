-- Game feedback becomes one row per send instead of one per player: user_id
-- stops being the primary key (Postgres's default name for it) and a new
-- identity column takes over. Existing rows keep their text and get ids.
ALTER TABLE "game_feedback" DROP CONSTRAINT "game_feedback_pkey";--> statement-breakpoint
ALTER TABLE "game_feedback" ADD COLUMN "id" bigint PRIMARY KEY NOT NULL GENERATED ALWAYS AS IDENTITY (sequence name "game_feedback_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1);--> statement-breakpoint
CREATE INDEX "game_feedback_player_idx" ON "game_feedback" USING btree ("user_id");--> statement-breakpoint
ALTER TABLE "game_feedback" DROP COLUMN "updated_at";
