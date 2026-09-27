ALTER TABLE "match" ADD COLUMN "tournament_match_id" text;--> statement-breakpoint
ALTER TABLE "match" ADD COLUMN "status" text DEFAULT 'active' NOT NULL;--> statement-breakpoint
ALTER TABLE "match" ADD COLUMN "target_score" integer DEFAULT 11 NOT NULL;--> statement-breakpoint
ALTER TABLE "match" ADD COLUMN "win_by_two" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "match" ADD COLUMN "first_server" text DEFAULT 'A' NOT NULL;--> statement-breakpoint
ALTER TABLE "match" ADD COLUMN "starting_right_a" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "match" ADD COLUMN "starting_right_b" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "match" ADD COLUMN "score_a" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "match" ADD COLUMN "score_b" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "match" ADD COLUMN "serving_team" text DEFAULT 'A' NOT NULL;--> statement-breakpoint
ALTER TABLE "match" ADD COLUMN "server_number" integer DEFAULT 2 NOT NULL;--> statement-breakpoint
ALTER TABLE "match" ADD COLUMN "server_index" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "match" ADD COLUMN "right_a" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "match" ADD COLUMN "right_b" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "match" ADD COLUMN "side_outs" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "match" ADD COLUMN "winner" text;--> statement-breakpoint
ALTER TABLE "match" ADD COLUMN "rally_log" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "match" ADD COLUMN "ended_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "match" ADD CONSTRAINT "match_tournament_match_id_tournament_match_id_fk" FOREIGN KEY ("tournament_match_id") REFERENCES "public"."tournament_match"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match" ADD CONSTRAINT "match_tournament_match_id_unique" UNIQUE("tournament_match_id");--> statement-breakpoint
ALTER TABLE "match" ADD CONSTRAINT "match_status_valid" CHECK ("match"."status" IN ('active', 'completed'));--> statement-breakpoint
ALTER TABLE "match" ADD CONSTRAINT "match_target_score_valid" CHECK ("match"."target_score" BETWEEN 1 AND 99);--> statement-breakpoint
ALTER TABLE "match" ADD CONSTRAINT "match_teams_valid" CHECK ("match"."first_server" IN ('A','B') AND "match"."serving_team" IN ('A','B') AND ("match"."winner" IS NULL OR "match"."winner" IN ('A','B')));--> statement-breakpoint
ALTER TABLE "match" ADD CONSTRAINT "match_positions_valid" CHECK ("match"."starting_right_a" IN (0,1) AND "match"."starting_right_b" IN (0,1) AND "match"."right_a" IN (0,1) AND "match"."right_b" IN (0,1) AND "match"."server_index" IN (0,1) AND "match"."server_number" IN (1,2));--> statement-breakpoint
ALTER TABLE "match" ADD CONSTRAINT "match_scores_valid" CHECK ("match"."score_a" >= 0 AND "match"."score_b" >= 0 AND "match"."side_outs" >= 0);