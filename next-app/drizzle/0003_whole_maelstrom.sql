CREATE TABLE "match" (
	"id" text PRIMARY KEY NOT NULL,
	"event_id" text,
	"played_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "match_player" (
	"match_id" text NOT NULL,
	"player_id" text NOT NULL,
	"team" text NOT NULL,
	"position" integer NOT NULL,
	CONSTRAINT "match_player_match_id_player_id_pk" PRIMARY KEY("match_id","player_id"),
	CONSTRAINT "match_player_team_valid" CHECK ("match_player"."team" IN ('A', 'B')),
	CONSTRAINT "match_player_position_valid" CHECK ("match_player"."position" IN (1, 2))
);
--> statement-breakpoint
CREATE TABLE "player" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"normalized_name" text GENERATED ALWAYS AS (lower(name)) STORED,
	"skill_level" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "player_name_valid" CHECK (length("player"."name") BETWEEN 1 AND 120 AND "player"."name" = btrim("player"."name")),
	CONSTRAINT "player_skill_valid" CHECK ("player"."skill_level" IS NULL OR "player"."skill_level" IN ('beginner', 'intermediate', 'advanced'))
);
--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "player_id" text;--> statement-breakpoint
ALTER TABLE "match" ADD CONSTRAINT "match_event_id_event_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."event"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_player" ADD CONSTRAINT "match_player_match_id_match_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."match"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_player" ADD CONSTRAINT "match_player_player_id_player_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."player"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "match_player_slot_unique" ON "match_player" USING btree ("match_id","team","position");--> statement-breakpoint
CREATE INDEX "match_player_player_idx" ON "match_player" USING btree ("player_id");--> statement-breakpoint
CREATE UNIQUE INDEX "player_normalized_name_unique" ON "player" USING btree ("normalized_name");--> statement-breakpoint
ALTER TABLE "user" ADD CONSTRAINT "user_player_id_player_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."player"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user" ADD CONSTRAINT "user_player_id_unique" UNIQUE("player_id");
--> statement-breakpoint
ALTER TABLE "player" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "match" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "match_player" ENABLE ROW LEVEL SECURITY;
