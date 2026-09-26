# 21 — A Rally engine module with tested scoring rules

**What to build:** Scoring a Game works exactly as it does today, but pickleball scoring moves into a Rally engine module: serve rotation, server number, side-outs, win-by-two and ending a Game. The module does no access checks, storage, network calls or rendering. Standalone and tournament Games are created by the same function inside it. The app calls the engine, then saves, syncs and renders whatever comes back.

Origin: architecture review candidate C4.

**Blocked by:** 01 — Open Play scheduler lives in its own tested module (sets the browser module and test pattern)

**Status:** ready-for-agent

- [ ] Scoring, undo, reset and ending a Game early behave the same on the scoreboard
- [ ] Tests with plain objects cover: a doubles Game starting at "0-0-2", a server switch, a side-out, singles serving side by score, and win-by-two (11-10 keeps playing, 12-10 wins)
- [ ] Standalone and tournament Games are built by one shared function
- [ ] A test shows undoing a Rally restores exactly the previous Game
