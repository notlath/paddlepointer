CREATE UNIQUE INDEX "tournament_match_id_round_unique" ON "tournament_match" USING btree ("id","round_id");--> statement-breakpoint
CREATE UNIQUE INDEX "tournament_round_id_tournament_unique" ON "tournament_round" USING btree ("id","tournament_id");--> statement-breakpoint
ALTER TABLE "tournament_match" ADD CONSTRAINT "tournament_match_round_tournament_fk" FOREIGN KEY ("round_id","tournament_id") REFERENCES "public"."tournament_round"("id","tournament_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tournament_match_player" ADD CONSTRAINT "tournament_match_player_match_round_fk" FOREIGN KEY ("match_id","round_id") REFERENCES "public"."tournament_match"("id","round_id") ON DELETE no action ON UPDATE no action;
