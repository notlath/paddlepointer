# 04 — Staff rename a Player and the new name shows everywhere

**What to build:** An Admin or Super Admin renames a Player from the Players list. The new name then appears everywhere the Player does:
- past Matches in History
- the Current Event's roster and Schedule
- the Live Board, Leaderboard and Partnerships
- the Qlik endpoints, so analytics pick it up after the next reload with no load-script change

Player names stay unique. Renaming to another Player's name is refused with a suggestion to Merge instead.

**Blocked by:** 01 — Players exist and every Match is linked to one

**Status:** done

- [x] Admins and Super Admins can rename a Player; the server refuses anyone else
- [x] After a rename, only the new name appears in History, the Current Event's roster and Schedule, the Live Board, the Leaderboard and Partnerships
- [x] The Qlik endpoints return the new name for all of that Player's past Matches
- [x] Renaming to another Player's name (ignoring case and spacing) is refused with a message suggesting Merge
- [x] A rename that changes only case or spacing ("jomar" to "Jomar") is allowed
- [x] A Match in progress during a rename saves without losing its Player link (covered by a test)
