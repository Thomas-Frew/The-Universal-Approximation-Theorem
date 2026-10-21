ALTER TABLE "feedback" ALTER COLUMN "understanding" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "feedback" ALTER COLUMN "implementation" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "feedback" ALTER COLUMN "overall" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "feedback" ADD CONSTRAINT "feedback_not_empty" CHECK ("feedback"."overall" is not null or "feedback"."understanding" is not null or "feedback"."implementation" is not null or "feedback"."comment" <> '');