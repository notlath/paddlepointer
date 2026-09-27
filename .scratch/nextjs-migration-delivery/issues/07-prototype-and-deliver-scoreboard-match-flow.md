# 07: Prototype and deliver the Scoreboard Match flow

**What to build:** As a scorer, I want a redesigned Scoreboard that lets me start, resume, score, and save a Match accurately, so that live results and Rally history remain reliable during play.

**Blocked by:** 03 Sign in with Better Auth and enforce role access; 06 Set up and schedule Open Play.

**Status:** implemented

**Prototype review:** Three Scoreboard layouts were reviewed; Court-first was selected. The delivered Scoreboard uses its court header, large Team Scores and Rally controls, with recent Rally history alongside. The throwaway variants are archived on branch `scoreboard-prototype-07`.

- [x] A Scoreboard prototype is reviewed first and its feedback is reflected in the delivered scorer interaction.
- [x] An authorized scorer can start, resume, and end the Match in a Tournament Match.
- [x] Rally actions correctly update Score, serving side, serve position, side-outs, and ordered Rally history using established scoring rules.
- [x] A scorer can undo an accidental action and recover active Match state after ordinary navigation or refresh.
- [x] Saved results persist in PostgreSQL and the UI distinguishes saving, saved, and failed states.
- [x] Browser journeys cover desktop and mobile scoring, Match lifecycle, Rally outcomes, undo, refresh recovery, and denied access.
