# 08 — Event / Court Analytics

**What to build:** Event / Court Analytics recomposed to `docs/qlik-sheet-design.md`. The
last Sheet, and the densest after Player Performance: 24×22 with an Event Summary table,
Matches per Event, Matches per court, a Court Utilization table, average duration per Event,
Players per Event, and the Event Leaderboard.

Seven content objects will not fit six slots. This Sheet needs grouping, not deletion — the
Event-shaped objects and the court-shaped objects are two questions sharing one Sheet, so
tabbed containers along that seam are the expected move. **Court Utilization** is the
recommended hero KPI: it is the one number an organiser acts on.

`Matches Missing Duration` must stay visible: it is the caveat on both utilization and the
average-duration figure (tickets 07 and 15). Not as a KPI tile.

Leave the deliberate measure choices from ticket 15 alone — the Event Leaderboard's Matches
column uses the plain `Matches` measure, not `Completed Matches`, so it mirrors the
Leaderboard Sheet exactly. That is intentional, not drift.

## This rebuild also repairs the starved objects (ticket 09, folded in)

4 objects on this Sheet carry 18 property paths where a healthy one of the same type
carries 48-97. They mount, show their title and draw nothing. Rebuilding each in the Qlik
editor writes the full default set, so the repair comes free with the recomposition — which
is why ticket 09 was folded into 03-08 rather than done as separate programmatic work.

Starved here: `SCadnc` barchart, `VSZbw` table, `KHeBw` table, `jwNwh` table.

Rebuild each one rather than editing it in place; an edit does not add the missing defaults.

**Blocked by:** 07 — Partnership Analysis

**Status:** superseded 2026-09-21 by ADR 0004 — PaddlePoint draws analytics itself; the headless track (`.scratch/headless-qlik-analytics/`) carries this subject. The Sheet stays for Qlik Cloud exploration; its starved objects are unfixed.

- [ ] `sheetMode` is `RESPONSIVE`, 24×12, extension off
- [ ] Four KPIs, one hero; `Matches Missing Duration` visible but not a tile
- [ ] Event-shaped and court-shaped objects grouped, nothing silently dropped
- [ ] `check-object-health.mjs` reports 0 starved objects on this Sheet
- [ ] Ticket 15's measure choices unchanged
- [ ] All six Sheets recorded side by side: do they read as one system?
