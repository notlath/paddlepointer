# 11 — Give every Live court slot a visible state

**What to build:** Staff and spectators can distinguish an available court, an unscheduled court, a loading court, an upcoming Match, an ongoing Match, and a final result without interpreting an empty dark rectangle.

Origin: UI/UX audit finding U-11, limited to Live court cards.

**Blocked by:** P0-08 — Make Live Board tabs keyboard operable

**Status:** completed

- [ ] A court with no scheduled Match displays a visible human-readable state
- [ ] Loading and failed-refresh states are visually distinct from a genuinely available court
- [ ] Upcoming, ongoing, and final cards retain consistent court number and status placement
- [ ] Status is conveyed by text or icon as well as color
- [ ] Empty-state labels remain legible in TV mode at expected viewing distance
- [ ] Routine Live refreshes update the state without moving keyboard focus
