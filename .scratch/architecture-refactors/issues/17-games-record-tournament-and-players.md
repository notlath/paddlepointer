# 17 — Games record their Tournament, Match and players

**What to build:** Saving a Game also records, as indexed data, which Tournament and Match it belongs to and each player in it. A schema migration fills this in for existing Games from their stored JSON. Clearing a Tournament's Games then finds them by Tournament instead of searching Game JSON text.

Origin: architecture review candidate C3. Uses the schema migration module from C1.

**Blocked by:** 03 — Saving a Game goes through a handler tests can call; 05 — Saving, reading and resetting a Tournament go through handlers

**Status:** ready-for-agent

- [ ] Saving a Game records its Tournament, its Match and one entry per player
- [ ] A migration backfills this for existing Games, with a test on a database holding standalone, tournament, singles and doubles Games
- [ ] Clearing a Tournament's Games finds them by Tournament and still deletes exactly the same Games as before (05's test still passes)
- [ ] Player names are trimmed and matched without regard to case, the way the Leaderboard groups them today
