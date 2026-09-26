# 06 — Staff Merge duplicate Players

**What to build:** Sometimes two Players turn out to be the same person, e.g. "Jomar E." and "Jomar Ebonite". An Admin or Super Admin merges one into the other from the Players list. Every Match, the linked account and the Skill level move to the surviving Player, and the absorbed name disappears everywhere, as a rename does in 04. A Merge cannot be undone, so staff confirm it first. It is refused when both Players have linked accounts.

**Blocked by:** 02 — Player accounts are linked to their Player; 04 — Staff rename a Player and the new name shows everywhere; 05 — Staff set a Player's Skill level

**Status:** done

- [x] Admins and Super Admins can merge one Player into another; the server refuses anyone else
- [x] After a Merge, every Match of the absorbed Player belongs to the survivor
- [x] Only the survivor's name appears in History, the Leaderboard, Partnerships, the Current Event's roster and Schedule, the Live Board and the Qlik endpoints
- [x] The survivor's Partnership and Leaderboard counts include the absorbed Player's Matches
- [x] A linked account on the absorbed Player moves to the survivor
- [x] Merging two Players who both have linked accounts is refused with a message to unlink one first
- [x] The survivor keeps their own Skill level; an Unrated survivor takes the absorbed Player's level
- [x] Merging two Players who appear in the same Match is refused, since one person cannot play in two spots of one Match
- [x] The confirmation names both Players and says the Merge cannot be undone
