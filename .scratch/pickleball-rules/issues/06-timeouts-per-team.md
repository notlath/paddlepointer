# 06 — Timeouts per Team

**What to build:** The Scoreboard lets the scorer record a timeout for either Team and shows how many each Team has left: 2 per Team in a game to 11 or 15, 3 in a game to 21. A Team with none left cannot take another. Timeouts are saved with the Match and appear in its Rally log.

Origin: pickleball rules review (finding R12).

**Blocked by:** None — can start immediately

**Status:** complete

- [x] The Scoreboard shows the timeouts each Team has left and a control to record one
- [x] Recording a timeout does not change the Score, the serve or the positions
- [x] A Team with no timeouts left cannot record another
- [x] Undo and refresh keep the timeout counts correct
- [x] Saved Matches include the timeouts each Team used
- [x] Tests cover the allowance for each target and running out
