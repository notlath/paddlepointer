# 02 — Leaderboard opens on the Current Event

**What to build:** The Leaderboard gives each new Event a fresh start without deleting anything (CONTEXT.md, Leaderboard). For staff and Players it opens on the Current Event and counts only that Event's finished Tournament Matches, for both Player and Team standings, with a heading that names the Event ("Current Event: Fall Classic"). An "All Events" toggle switches to every finished Match, including Matches played outside any Tournament — which is what the Leaderboard shows today. The toggle is not remembered: every visit to the Leaderboard opens on the Current Event. The Visitor Leaderboard (Visitor Matches only, which belong to no Event) is unchanged and has no toggle. Players who only see their own Matches keep that restriction in both scopes.

These rules match the Qlik analytics: the Current Event view equals Analytics with that Event selected; All Events equals Analytics with nothing selected. Analytics itself still opens on all Events (ADR 0002).

**Blocked by:** None — can start immediately.

**Status:** ready-for-agent

- [ ] The Leaderboard endpoint accepts an optional Event scope; without it, behaviour is unchanged (all Events)
- [ ] Scoped to an Event, it counts only that Event's finished Tournament Matches; standard Matches with no Event are excluded
- [ ] The Leaderboard view opens on the Current Event and its heading names it
- [ ] An "All Events" toggle shows every finished Match including non-Tournament Matches; leaving and returning to the Leaderboard resets it to the Current Event
- [ ] The Visitor Leaderboard shows the same results as before and has no toggle
- [ ] A Player's own-Matches restriction applies in both scopes
- [ ] An empty Current Event shows an empty-state message that names the Event and points to All Events
