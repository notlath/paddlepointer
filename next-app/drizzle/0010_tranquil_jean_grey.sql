CREATE TABLE "qlik_reload_pending" (
	"singleton" integer PRIMARY KEY NOT NULL,
	"marker" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "qlik_reload_pending" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION mark_qlik_reload_pending() RETURNS trigger AS $$
BEGIN
  INSERT INTO qlik_reload_pending (singleton, marker) VALUES (1, gen_random_uuid()::text)
  ON CONFLICT (singleton) DO UPDATE SET marker = EXCLUDED.marker;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER qlik_match_change AFTER INSERT OR UPDATE OR DELETE ON "match" FOR EACH STATEMENT EXECUTE FUNCTION mark_qlik_reload_pending();
--> statement-breakpoint
CREATE TRIGGER qlik_match_player_change AFTER INSERT OR UPDATE OR DELETE ON "match_player" FOR EACH STATEMENT EXECUTE FUNCTION mark_qlik_reload_pending();
--> statement-breakpoint
CREATE TRIGGER qlik_player_change AFTER INSERT OR UPDATE OR DELETE ON "player" FOR EACH STATEMENT EXECUTE FUNCTION mark_qlik_reload_pending();
--> statement-breakpoint
CREATE TRIGGER qlik_event_change AFTER INSERT OR UPDATE OR DELETE ON "event" FOR EACH STATEMENT EXECUTE FUNCTION mark_qlik_reload_pending();
--> statement-breakpoint
CREATE TRIGGER qlik_current_event_change AFTER INSERT OR UPDATE OR DELETE ON "current_event" FOR EACH STATEMENT EXECUTE FUNCTION mark_qlik_reload_pending();
--> statement-breakpoint
CREATE TRIGGER qlik_tournament_change AFTER INSERT OR UPDATE OR DELETE ON "tournament" FOR EACH STATEMENT EXECUTE FUNCTION mark_qlik_reload_pending();
--> statement-breakpoint
CREATE TRIGGER qlik_tournament_match_change AFTER INSERT OR UPDATE OR DELETE ON "tournament_match" FOR EACH STATEMENT EXECUTE FUNCTION mark_qlik_reload_pending();
--> statement-breakpoint
CREATE TRIGGER qlik_tournament_match_player_change AFTER INSERT OR UPDATE OR DELETE ON "tournament_match_player" FOR EACH STATEMENT EXECUTE FUNCTION mark_qlik_reload_pending();
