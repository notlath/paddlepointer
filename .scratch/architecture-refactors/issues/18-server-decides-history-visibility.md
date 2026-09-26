# 18 — The server decides which Games each viewer sees

**What to build:** History for every role comes from one visibility rule on the server, using the players recorded in 17 instead of searching Game JSON for a name. The browser stops re-filtering History with its own copy of the rule.

Intended behaviour change: a Player's Games are matched on recorded player names, not by searching text. So a Player named "Al" no longer sees Games that only mention "Alice". Update 06's tests to match.

Origin: architecture review candidate C3.

**Blocked by:** 06 — History goes through a handler with visibility tests per role; 17 — Games record their Tournament, Match and players

**Status:** ready-for-agent

- [ ] Visitors, Players, staff and signed-out requests see the Games 06's tests define, apart from the name-matching change above
- [ ] Looking up a Player's Games uses the recorded player data, with no search through Game JSON
- [ ] The browser no longer filters History by role or name itself
- [ ] Tests cover the rule for each role, including the "Al" vs "Alice" case
