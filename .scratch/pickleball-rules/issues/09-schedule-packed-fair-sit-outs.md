# 09 — Schedules are packed tight and sit-outs are shared fairly

**What to build:** A generated Open Play Schedule uses as few Rounds as the courts and Players allow. No Player sits out two Rounds in a row while others play, unless there are too many Players for that to be possible. Today, when the Player count is not a multiple of 4, the Schedule runs extra Rounds and some Players sit out twice in a row (for example 9 Rounds instead of 7 for 13 Players on 3 courts). Locked (started or completed) Matches stay unchanged.

Origin: pickleball rules review (scheduler measurements for 10, 13, 17, 22 and 30 Players).

**Blocked by:** None — can start immediately

**Status:** complete

- [x] The Round count equals the minimum for the Players, courts and Matches per Player, for 10/2, 13/3, 17/4, 22/4 and 30/6 (Players/courts)
- [x] No Player sits out two Rounds in a row in those cases
- [x] Games per Player still differ by at most 1, and existing partner-variety and performance limits still hold
- [x] Regenerating keeps locked Matches in place
- [x] Scheduler tests cover each case above with a seeded random source
