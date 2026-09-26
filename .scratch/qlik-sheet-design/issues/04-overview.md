# 04 — Overview

**What to build:** Overview recomposed to `docs/qlik-sheet-design.md`. The landing Sheet, so
the visible win is largest — but second, because the template should already be proved.

Closest of the six to the standard already: 24×20 with four KPIs (Active Players, Completed
Matches, Events, Average Match Duration) and six objects. Two changes of substance: down to
24×12 unextended, and one of the four KPIs becomes the hero in its own object.

Which is the hero is this ticket's call, not the standard's. **Completed Matches** is the
recommendation — it is the number that says whether an Event happened at all, and Active
Players and Events read as its context.

The filter pane moves to the left column at 4×12. Matches-over-time is the trend zone;
Top 10 Players and Recent Matches are the detail zone.

## This rebuild also repairs the starved objects (ticket 09, folded in)

4 object(s) on this Sheet carry 18 property paths where a healthy one of the same type
carries 48-97. They mount, show their title and draw nothing. Rebuilding each in the Qlik
editor writes the full default set, so the repair comes free with the recomposition — which
is why ticket 09 was folded into 03-08 rather than done as separate programmatic work.

Starved here: `nPQgD` barchart, `vDWeQb` barchart, `Puvmn` table, `ExNHakj` table.

Rebuild each one rather than editing it in place; an edit does not add the missing defaults.

**Blocked by:** 03 — Player Performance: the template, proved on the worst Sheet

**Status:** superseded 2026-09-21 by ADR 0004 — PaddlePoint draws analytics itself; the headless track (`.scratch/headless-qlik-analytics/`) carries this subject. The Sheet stays for Qlik Cloud exploration; its starved objects are unfixed.

- [ ] `sheetMode` is `RESPONSIVE`, 24×12, extension off
- [ ] Zones and slot sizes match the standard's diagram
- [ ] One hero KPI in its own object; the other three share one object
- [ ] `check-object-health.mjs` reports 0 starved objects on this Sheet
- [ ] Nothing scrolls inside the 850px embed frame at laptop width
- [ ] Recorded with a screenshot at laptop width
