# 05 — A switch-ends prompt

**What to build:** When the leading Team first reaches the midpoint of the target score (6 in a game to 11, 8 in a game to 15, 11 in a game to 21: half the target, rounded up), the Scoreboard and the Live Board tell the Players to switch ends. The prompt appears once per Match, and undoing past the midpoint clears it.

Origin: pickleball rules review (finding R11).

**Blocked by:** None — can start immediately

**Status:** complete

- [x] The Scoreboard shows "Switch ends" on the Rally where the leading Team first reaches the midpoint
- [x] The Live Board card for that court shows the same cue
- [x] The cue does not repeat later in the Match, and undo before the midpoint removes it
- [x] Targets that are not 11, 15 or 21 use half the target, rounded up
- [x] Tests cover targets 11, 15, 21 and an undo across the midpoint
