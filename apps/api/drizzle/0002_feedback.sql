CREATE TABLE "feedback" (
	"user_id" text NOT NULL,
	"level_id" uuid NOT NULL,
	"level_version" integer NOT NULL,
	"understanding" integer NOT NULL,
	"implementation" integer NOT NULL,
	"overall" integer NOT NULL,
	"comment" text DEFAULT '' NOT NULL,
	"solved" boolean NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "feedback_user_id_level_id_level_version_pk" PRIMARY KEY("user_id","level_id","level_version"),
	CONSTRAINT "feedback_ratings_range" CHECK ("feedback"."understanding" between 1 and 8 and "feedback"."implementation" between 1 and 8 and "feedback"."overall" between 1 and 8)
);
--> statement-breakpoint
ALTER TABLE "feedback" ADD CONSTRAINT "feedback_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;