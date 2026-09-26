# 01 — Players exist and every Match is linked to one

**What to build:** Players become lasting records instead of loose names (ADR 0005). Every past non-Visitor Match is backfilled, and each distinct name, trimmed and compared regardless of case, becomes one Player. After that, saving a Match or a Tournament roster links each name to a Player. A name that matches an existing Player reuses it; any other name creates a new Player. Staff get a read-only **Players** list, the first place Players are visible as records.

Overlap: architecture-refactors ticket 17 (Games record their players) covers the per-Match player index this builds on. The code already seems to have that index even though 17 is still open. Check its state before starting, and reuse it rather than duplicating it.

**Blocked by:** None — can start immediately

**Status:** done

- [x] A migration creates one Player per distinct normalised name across every non-Visitor Match (finished or not), Tournament roster and Schedule
- [x] The migration test covers a database with standalone, Tournament, singles and doubles Matches, names that differ only by case or spacing, and Visitor Matches
- [x] After the migration, every player entry on a non-Visitor Match points at a Player
- [x] Saving a Match or a Tournament roster reuses the Player whose normalised name matches, or creates one
- [x] Names in Visitor Matches create no Players
- [x] Admins and Super Admins see a Players list with each Player's name, Match count and Events; Players and Visitors cannot open it
- [x] Every screen that shows names today looks the same as before: Scoreboard, Live Board, History, Leaderboard and Analytics
