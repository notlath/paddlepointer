# 01 — A Match ended early records who retired or forfeited

**What to build:** When a scorer ends a Match early, End Match asks which Team retired or forfeited. The other Team is recorded as the winner, whatever the Score, in History, the Leaderboard and the Tournament Match. Today the Team that is ahead wins, and a 0-0 or tied ending records no winner and leaves the Tournament Match unlocked. Under the rules, the Team that retires or forfeits loses.

Origin: pickleball rules review (rules harness finding R9).

**Blocked by:** None — can start immediately

**Status:** complete

- [x] End Match asks the scorer which Team retired or forfeited before confirming
- [x] The other Team is saved as the winner even when the retiring Team is ahead
- [x] A 0-0 forfeit records a winner and completes (locks) the Tournament Match
- [x] The saved Match records that it ended by retirement/forfeit and which Team retired, and History shows this
- [x] Rally-engine tests cover: retirement while leading, while trailing, and at 0-0
