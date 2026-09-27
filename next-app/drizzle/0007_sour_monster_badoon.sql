ALTER TABLE "match" ADD COLUMN "ended_early" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "match" ADD COLUMN "retired_team" text;--> statement-breakpoint
UPDATE "match" SET "ended_early" = true WHERE "status" = 'completed' AND (GREATEST("score_a", "score_b") < "target_score" OR ("win_by_two" AND ABS("score_a" - "score_b") < 2));--> statement-breakpoint
ALTER TABLE "match" ADD CONSTRAINT "match_retirement_valid" CHECK ("match"."retired_team" IS NULL OR ("match"."retired_team" IN ('A','B') AND "match"."retired_team" <> "match"."winner" AND "match"."ended_early"));
