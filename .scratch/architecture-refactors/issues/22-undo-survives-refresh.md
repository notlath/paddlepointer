# 22 — Undo survives a page refresh

**What to build:** After a page refresh mid-Game, choosing Continue Match brings Undo back: the last Rally can still be undone. That works because undo rebuilds the Game from its recorded Rallies, instead of from an in-memory copy that the refresh throws away.

Origin: architecture review candidate C4.

**Blocked by:** 21 — A Rally engine module with tested scoring rules

**Status:** ready-for-agent

- [ ] After refreshing mid-Game, continuing and pressing Undo, the last Rally is undone and the score, server and sides are what they were before it
- [ ] Undo can go all the way back to 0-0 after a refresh
- [ ] A test shows undoing a Rally gives the same Game as never having played it
- [ ] Undoing a Rally in a tournament Match still updates the score on the Live board, as it does today
