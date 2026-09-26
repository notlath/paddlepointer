# 06 — History goes through a handler with visibility tests per role

**What to build:** Loading shared History behaves exactly as it does today. It goes through a handler, following 03's pattern, whose tests pin down which Games each viewer sees before C3 moves that rule onto indexed data.

Origin: architecture review candidate C8, groundwork for C3. The separate auth security review may change what signed-out requests are allowed to see; these tests record today's behaviour.

**Blocked by:** 03 — Saving a Game goes through a handler tests can call

**Status:** ready-for-agent

- [ ] History over HTTP returns the same Games as before
- [ ] Test: a Visitor sees visitor Games only
- [ ] Test: a Player sees Games they created or are named in, and never visitor Games
- [ ] Test: staff and signed-out requests see all non-visitor Games, and can filter by player name or scorer
- [ ] Test: the limit is clamped between 1 and 200, and Games come newest first
