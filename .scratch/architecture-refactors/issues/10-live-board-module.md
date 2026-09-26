# 10 — A Live board module builds the court cards

**What to build:** The Live board looks and updates exactly as it does today. But its court cards and next-match queue now come from a Live board module that's given the Tournament, the active Game and the current time. Rendering only draws what the module returns, and stops overwriting the shared Tournament while it draws.

Origin: architecture review candidate C10.

**Blocked by:** 01 — Open Play scheduler lives in its own tested module (sets the browser module and test pattern)

**Status:** ready-for-agent

- [ ] The Ongoing tab, the Next tab and the full-size score overlay show the same cards as before
- [ ] Rendering the Live board no longer replaces the Tournament held in the app's state
- [ ] Tests cover a live Game, an in-progress Match, a final result that stays until the next Match on that Court starts, a scheduled Match, and an empty Court
- [ ] Tests pass in a fixed time, so match durations are checked exactly
