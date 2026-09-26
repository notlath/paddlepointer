# 02 — Player accounts are linked to their Player

**What to build:** Each Player account links to at most one Player. A signed-in Player's own History and Leaderboard filter follow that link instead of matching name strings, so changing an account's display name no longer makes their Matches disappear. Creating a Player login creates the Player, or links the existing one with that name.

Overlap: architecture-refactors ticket 18 (the server decides History visibility) touches the same filter. If 18 has landed, change its rule; if not, change the current one. Don't wait for it.

**Blocked by:** 01 — Players exist and every Match is linked to one

**Status:** done

- [x] A migration links each existing Player account to the Player whose normalised name matches its display name, or failing that its username
- [x] No Player is linked to more than one account
- [x] Create Player login creates the Player, or links the existing one of the same name, and still adds them to Registered players as it does today
- [x] A signed-in Player sees exactly the Matches their linked Player played in, plus any they scored
- [x] Changing the account's display name leaves that History unchanged (covered by a test)
- [x] The Players list shows which Players have a linked account
