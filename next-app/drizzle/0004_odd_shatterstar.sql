CREATE TABLE "tournament_match" (
	"id" text PRIMARY KEY NOT NULL,
	"tournament_id" text NOT NULL,
	"round_id" text NOT NULL,
	"court" integer NOT NULL,
	"status" text DEFAULT 'scheduled' NOT NULL,
	CONSTRAINT "tournament_match_court_valid" CHECK ("tournament_match"."court" > 0),
	CONSTRAINT "tournament_match_status_valid" CHECK ("tournament_match"."status" IN ('scheduled', 'in_progress', 'completed'))
);
--> statement-breakpoint
CREATE TABLE "tournament_match_player" (
	"match_id" text NOT NULL,
	"round_id" text NOT NULL,
	"player_id" text NOT NULL,
	"team" text NOT NULL,
	"position" integer NOT NULL,
	CONSTRAINT "tournament_match_player_match_id_player_id_pk" PRIMARY KEY("match_id","player_id"),
	CONSTRAINT "tournament_match_player_team_valid" CHECK ("tournament_match_player"."team" IN ('A', 'B')),
	CONSTRAINT "tournament_match_player_position_valid" CHECK ("tournament_match_player"."position" IN (1, 2))
);
--> statement-breakpoint
CREATE TABLE "tournament_player" (
	"tournament_id" text NOT NULL,
	"player_id" text NOT NULL,
	"available" boolean DEFAULT true NOT NULL,
	CONSTRAINT "tournament_player_tournament_id_player_id_pk" PRIMARY KEY("tournament_id","player_id")
);
--> statement-breakpoint
CREATE TABLE "tournament_round" (
	"id" text PRIMARY KEY NOT NULL,
	"tournament_id" text NOT NULL,
	"number" integer NOT NULL,
	CONSTRAINT "tournament_round_number_valid" CHECK ("tournament_round"."number" > 0)
);
--> statement-breakpoint
ALTER TABLE "tournament" ADD COLUMN "courts" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "tournament" ADD COLUMN "matches_per_player" integer DEFAULT 3 NOT NULL;--> statement-breakpoint
ALTER TABLE "tournament" ADD COLUMN "target_score" integer DEFAULT 11 NOT NULL;--> statement-breakpoint
ALTER TABLE "tournament" ADD COLUMN "transition_minutes" integer DEFAULT 2 NOT NULL;--> statement-breakpoint
ALTER TABLE "tournament_match" ADD CONSTRAINT "tournament_match_tournament_id_tournament_id_fk" FOREIGN KEY ("tournament_id") REFERENCES "public"."tournament"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tournament_match" ADD CONSTRAINT "tournament_match_round_id_tournament_round_id_fk" FOREIGN KEY ("round_id") REFERENCES "public"."tournament_round"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tournament_match_player" ADD CONSTRAINT "tournament_match_player_match_id_tournament_match_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."tournament_match"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tournament_match_player" ADD CONSTRAINT "tournament_match_player_round_id_tournament_round_id_fk" FOREIGN KEY ("round_id") REFERENCES "public"."tournament_round"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tournament_match_player" ADD CONSTRAINT "tournament_match_player_player_id_player_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."player"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tournament_player" ADD CONSTRAINT "tournament_player_tournament_id_tournament_id_fk" FOREIGN KEY ("tournament_id") REFERENCES "public"."tournament"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tournament_player" ADD CONSTRAINT "tournament_player_player_id_player_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."player"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tournament_round" ADD CONSTRAINT "tournament_round_tournament_id_tournament_id_fk" FOREIGN KEY ("tournament_id") REFERENCES "public"."tournament"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "tournament_match_round_court_unique" ON "tournament_match" USING btree ("round_id","court");--> statement-breakpoint
CREATE INDEX "tournament_match_tournament_idx" ON "tournament_match" USING btree ("tournament_id");--> statement-breakpoint
CREATE UNIQUE INDEX "tournament_match_player_slot_unique" ON "tournament_match_player" USING btree ("match_id","team","position");--> statement-breakpoint
CREATE UNIQUE INDEX "tournament_match_player_round_unique" ON "tournament_match_player" USING btree ("round_id","player_id");--> statement-breakpoint
CREATE INDEX "tournament_match_player_player_idx" ON "tournament_match_player" USING btree ("player_id");--> statement-breakpoint
CREATE INDEX "tournament_player_player_idx" ON "tournament_player" USING btree ("player_id");--> statement-breakpoint
CREATE UNIQUE INDEX "tournament_round_number_unique" ON "tournament_round" USING btree ("tournament_id","number");--> statement-breakpoint
ALTER TABLE "tournament" ADD CONSTRAINT "tournament_courts_valid" CHECK ("tournament"."courts" BETWEEN 1 AND 16);--> statement-breakpoint
ALTER TABLE "tournament" ADD CONSTRAINT "tournament_matches_per_player_valid" CHECK ("tournament"."matches_per_player" BETWEEN 1 AND 30);--> statement-breakpoint
ALTER TABLE "tournament" ADD CONSTRAINT "tournament_target_score_valid" CHECK ("tournament"."target_score" BETWEEN 1 AND 99);--> statement-breakpoint
ALTER TABLE "tournament" ADD CONSTRAINT "tournament_transition_minutes_valid" CHECK ("tournament"."transition_minutes" BETWEEN 0 AND 20);
--> statement-breakpoint
ALTER TABLE "tournament_player" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "tournament_round" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "tournament_match" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "tournament_match_player" ENABLE ROW LEVEL SECURITY;
