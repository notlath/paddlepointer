# 08 — The next Match goes to the court that's free

**What to build:** "Start Next Match" and the Live Board's queue pick, for each open court, the earliest scheduled Match whose Players are all free. A court that finishes early no longer waits for a Round to finish, and the queue never offers a Match on a court that is still playing. Today the queue goes strictly by Round, then court.

Origin: pickleball rules review (queue finding: queue ignores free courts and busy Players).

**Blocked by:** 07 — A Player can't be in two live Matches at once

**Status:** complete

- [x] "Start Next Match" offers a Match for a court that is open, with all four Players free
- [x] When a court frees up, its next card on the Live Board shows the earliest scheduled Match that can start there
- [x] A Match is never offered while one of its Players is still on another court
- [x] Live Board tests cover an early-finishing court and a Match waiting on a busy Player
