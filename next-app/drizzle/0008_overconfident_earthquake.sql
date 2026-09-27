CREATE TABLE "event_revision" (
	"event_id" text PRIMARY KEY NOT NULL,
	"revision" integer DEFAULT 0 NOT NULL,
	"last_txid" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "event_revision" ADD CONSTRAINT "event_revision_event_id_event_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."event"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
CREATE FUNCTION public.notify_event_revision() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  affected_event text;
  next_revision integer;
BEGIN
  IF TG_TABLE_NAME = 'tournament' THEN
    IF TG_OP = 'DELETE' THEN affected_event := OLD.event_id; ELSE affected_event := NEW.event_id; END IF;
  ELSIF TG_TABLE_NAME = 'tournament_match' THEN
    IF TG_OP = 'DELETE' THEN affected_event := OLD.tournament_id; ELSE affected_event := NEW.tournament_id; END IF;
  ELSE
    IF TG_OP = 'DELETE' THEN affected_event := OLD.event_id; ELSE affected_event := NEW.event_id; END IF;
  END IF;
  IF affected_event IS NULL THEN RETURN NULL; END IF;
  INSERT INTO public.event_revision (event_id, revision, last_txid)
  VALUES (affected_event, 1, txid_current()::text)
  ON CONFLICT (event_id) DO UPDATE
    SET revision = public.event_revision.revision + 1, last_txid = EXCLUDED.last_txid
    WHERE public.event_revision.last_txid IS DISTINCT FROM EXCLUDED.last_txid
  RETURNING revision INTO next_revision;
  IF next_revision IS NOT NULL AND to_regprocedure('realtime.send(jsonb,text,text,boolean)') IS NOT NULL THEN
    EXECUTE 'SELECT realtime.send($1, $2, $3, $4)'
      USING jsonb_build_object('eventId', affected_event, 'revision', next_revision), 'changed', 'event:' || affected_event, false;
  END IF;
  RETURN NULL;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER tournament_revision AFTER INSERT OR UPDATE OR DELETE ON public.tournament FOR EACH ROW EXECUTE FUNCTION public.notify_event_revision();
--> statement-breakpoint
CREATE TRIGGER tournament_match_revision AFTER INSERT OR UPDATE OR DELETE ON public.tournament_match FOR EACH ROW EXECUTE FUNCTION public.notify_event_revision();
--> statement-breakpoint
CREATE TRIGGER match_revision AFTER INSERT OR UPDATE OR DELETE ON public.match FOR EACH ROW EXECUTE FUNCTION public.notify_event_revision();
--> statement-breakpoint
CREATE FUNCTION public.notify_current_event_switch() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF (TG_OP = 'INSERT' OR NEW.event_id IS DISTINCT FROM OLD.event_id)
    AND to_regprocedure('realtime.send(jsonb,text,text,boolean)') IS NOT NULL THEN
    EXECUTE 'SELECT realtime.send($1, $2, $3, $4)'
      USING jsonb_build_object('eventId', NEW.event_id), 'current-event-changed', 'live-board', false;
  END IF;
  RETURN NULL;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER current_event_switch AFTER INSERT OR UPDATE OF event_id ON public.current_event FOR EACH ROW EXECUTE FUNCTION public.notify_current_event_switch();
--> statement-breakpoint
INSERT INTO public.event_revision (event_id, revision, last_txid)
SELECT event_id, 1, txid_current()::text FROM public.tournament
ON CONFLICT (event_id) DO NOTHING;
