# 16 — Each Match gets its own row

**What to build:** Matches are stored one per row instead of inside the Tournament's JSON, so a tournament Rally locks only its own Match and Courts stop queueing behind each other. A schema migration moves existing Matches out of every stored Tournament with nothing lost. The browser keeps receiving the same Tournament shape, so nothing changes on screen.

Origin: architecture review candidate C2. Uses the schema migration module from C1.

**Blocked by:** 14 — One Match lifecycle module decides every Match change

**Status:** ready-for-agent

- [ ] A migration moves every existing Match into its own row, and a test on a database with existing Tournaments shows no Match, score or lock is lost
- [ ] Reading a Tournament returns the same shape the browser gets today
- [ ] A score update for one Match doesn't lock or rewrite other Matches or the rest of the Tournament
- [ ] A test shows score updates on two Courts at the same time don't wait on each other
- [ ] All tests from 04, 05 and 14 still pass
