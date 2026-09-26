# 05: Manage the Player directory

**What to build:** As a staff member, I want to maintain lasting Player identities and their skill levels, so that records stay consistent across Events and Open Play scheduling can use accurate Player information.

**Blocked by:** 01 Deploy the Next.js foundation; 03 Sign in with Better Auth and enforce role access.

**Status:** implemented

- [x] Authorized staff can find and view Players and update a Player's skill level.
- [x] Player names remain unique, trimmed, and compared without regard to case; views show the current name.
- [x] Authorized staff can rename a Player and see the new name consistently in historical Match views.
- [x] Authorized staff can merge duplicate Players; Matches, skill level, and any linked account resolve to the surviving Player.
- [x] Merge is clearly identified as irreversible and requires an explicit confirmation.
- [x] Browser journeys cover Player listing, skill level, rename, merge, validation failures, and denied access.

Match participation is stored by Player ID, so a rename or Merge appears under the surviving Player's current name in read-only Match history. The later Match-flow tickets will extend this relational Match record with scores, Rallies, and scheduling data.

As in the legacy Player directory, Merge refuses two Players who both occupy slots in one Match, or who both have linked accounts. Staff must resolve that conflicting Match or account link before retrying; silently discarding a participant or account would corrupt history.
