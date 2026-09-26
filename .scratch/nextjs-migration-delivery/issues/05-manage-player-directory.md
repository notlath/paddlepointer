# 05: Manage the Player directory

**What to build:** As a staff member, I want to maintain lasting Player identities and their skill levels, so that records stay consistent across Events and Open Play scheduling can use accurate Player information.

**Blocked by:** 01 Deploy the Next.js foundation; 03 Sign in with Better Auth and enforce role access.

**Status:** ready-for-agent

- [ ] Authorized staff can find and view Players and update a Player's skill level.
- [ ] Player names remain unique, trimmed, and compared without regard to case; views show the current name.
- [ ] Authorized staff can rename a Player and see the new name consistently in historical Match views.
- [ ] Authorized staff can merge duplicate Players; Matches, skill level, and any linked account resolve to the surviving Player.
- [ ] Merge is clearly identified as irreversible and requires an explicit confirmation.
- [ ] Browser journeys cover Player listing, skill level, rename, merge, validation failures, and denied access.
