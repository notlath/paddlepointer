# 03 — The toss winner chooses the first server and who starts on the right

**What to build:** Before the first Rally of a Match, the scorer chooses which Team serves first and which Player on each Team starts in the right court. Serving then proceeds from that choice. Today Tournament Matches always have Team A serve first, and the Players' starting sides follow the order they appear in the Schedule. The rules leave these choices to the coin-toss winner.

Origin: pickleball rules review (finding R13).

**Blocked by:** None — can start immediately

**Status:** complete

- [x] Starting a Tournament Match lets the scorer pick the serving Team and each Team's right-court Player (defaults match today's behaviour)
- [x] Regular Match setup lets the scorer pick each Team's right-court Player as well as the first server
- [x] The score call, serve side and server name on the Scoreboard and Live Board follow the choice from 0-0-2 onwards
- [x] Undo and refresh keep the chosen starting setup
- [x] Rally-engine tests cover Team B serving first with its second-listed Player on the right
