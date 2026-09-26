# 04 — The scorer can correct the server or positions mid-Match

**What to build:** If the court and the Scoreboard disagree about who is serving or which side each Player is on, the scorer can correct the serving Player or swap a Team's positions without undoing Rallies. The correction is recorded as an entry in the Match's Rally log, so undo, refresh and the Live Board all respect it.

Origin: pickleball rules review (finding R14).

**Blocked by:** None — can start immediately

**Status:** complete

- [x] The Scoreboard offers "correct server / positions" while a Match is active
- [x] After a correction, later Rallies serve and swap from the corrected positions
- [x] Undo steps back over a correction like a Rally; replaying the Rally log reproduces the corrected state after a refresh
- [x] The correction appears in the Match's Rally log
- [x] Rally-engine tests cover a correction followed by points, a side-out and an undo
