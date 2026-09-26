# 05 — Staff set a Player's Skill level

**What to build:** An Admin or Super Admin sets a Player's Skill level from the Players list: Beginner, Intermediate, Advanced, or Unrated. The picker shows a one-line description of each level, so staff can judge by watching one Match:

- **Beginner**: learning the rules and serve; rallies are short.
- **Intermediate**: consistent serves and returns, starting to dink and stack.
- **Advanced**: controls pace and placement, plays the kitchen deliberately.

Skill level is staff-only. It never reaches Players, Visitors or the Live Board.

**Blocked by:** 01 — Players exist and every Match is linked to one

**Status:** done

- [x] Every Player starts Unrated, including those created by the 01 backfill
- [x] Admins and Super Admins can set or clear a Player's Skill level, and the picker shows each level's description
- [x] The server refuses the change from Players, Visitors and signed-out requests
- [x] No response sent to a Player, a Visitor or the Live Board includes Skill level (covered by a test)
- [x] Tournament setup shows staff each rostered Player's Skill level
