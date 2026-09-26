CREATE TABLE "current_event" (
	"singleton" integer PRIMARY KEY NOT NULL CHECK ("singleton" = 1),
	"event_id" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "event" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tournament" (
	"id" text PRIMARY KEY NOT NULL,
	"event_id" text NOT NULL,
	CONSTRAINT "tournament_event_id_unique" UNIQUE("event_id")
);
--> statement-breakpoint
ALTER TABLE "current_event" ADD CONSTRAINT "current_event_event_id_event_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."event"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tournament" ADD CONSTRAINT "tournament_event_id_event_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."event"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "event" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "tournament" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "current_event" ENABLE ROW LEVEL SECURITY;
