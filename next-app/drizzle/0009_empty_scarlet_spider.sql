CREATE TABLE "visitor_match" (
	"id" text PRIMARY KEY NOT NULL,
	"owner_id" text NOT NULL,
	"game" jsonb NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"played_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ended_at" timestamp with time zone,
	CONSTRAINT "visitor_match_status_valid" CHECK ("visitor_match"."status" IN ('active', 'completed'))
);
--> statement-breakpoint
ALTER TABLE "visitor_match" ADD CONSTRAINT "visitor_match_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "visitor_match_owner_played_idx" ON "visitor_match" USING btree ("owner_id","played_at");
--> statement-breakpoint
ALTER TABLE "visitor_match" ENABLE ROW LEVEL SECURITY;
