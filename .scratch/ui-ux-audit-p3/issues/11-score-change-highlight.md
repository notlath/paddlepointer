# 11 — Score-change highlight

**What to build:** When a Score changes, the scorer on the Scoreboard and spectators on the Live Board get a brief visual acknowledgement on the number that changed. Today the digit simply swaps, which is easy to miss on a TV across a venue.

Origin: UI polish audit finding M9.

**Blocked by:** 09 — Focused Scoreboard serving information

**Status:** completed

- [x] On the Scoreboard, the Team score that just changed gets a brief highlight lasting 300ms or less after a Rally is recorded or undone
- [x] On the Live Board (normal and TV mode), a court's Score gets the same highlight when a refresh brings a changed Score
- [x] The highlight never plays on first load, on view changes, or on a refresh where the Score did not change
- [x] The highlight is interruptible: rapid consecutive Rallies do not queue or stack animations
- [x] The highlight animates only opacity, color, or transform and does not shift layout
- [x] Under reduced motion, no animation plays; the Score update itself is the feedback
- [x] Side-outs and server switches that do not change a Score do not trigger the highlight
- [x] Rendering stays within the existing one-render-per-frame behavior
- [x] A test covers "changed Score triggers highlight" and "unchanged Score or first render does not"

Implementation notes:
- A small score highlight module runs inside each render. Every Score carries a key (Scoreboard: Match and Team; Live Board: court card and Team). A Score whose value differs from the previous render gets a 220ms scale-and-fade; keys missing from a render are forgotten, so first renders and returns to a view stay still.
- Each render builds fresh elements, so a new Rally replaces the previous animation instead of queuing it.
- Verified in the browser with the real Live Board templates: first render, unchanged refresh, and return after another view highlighted nothing; a changed Score highlighted only that Score with a 0.22s score-change animation. The Scoreboard path is covered by tests; it was not checked in a signed-in session.
