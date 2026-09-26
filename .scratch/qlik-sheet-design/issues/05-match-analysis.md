# 05 — Match Analysis

**What to build:** Match Analysis recomposed to `docs/qlik-sheet-design.md`. Its KPI object
carries **seven** tiles and was widened from 12 to 48 grid columns to fit them (ticket 07):
Matches, Avg Score, Avg Margin, Average Duration, Matches Missing Duration, Close Matches,
High-scoring Matches.

Four survive. The recommendation: **Average Duration** as the hero, with **Matches**,
**Close Matches** and **High-scoring Matches** beside it — the three that describe how play
actually went. Avg Score and Avg Margin move into the charts or a table. `Matches Missing
Duration` must stay visible somewhere, because it is the caveat on every duration average
on the Sheet (tickets 07 and 15) — a footnote or a table column, not a KPI tile.

Keep the CONTEXT.md-worded descriptions on Close Matches and High-scoring Matches: Qlik
renders them as tooltips, and ticket 07 required those definitions be visible.

Objects to place: Matches-by-day bar, Matches-by-hour line, average duration per Round,
average duration per court. Four charts do not fit one trend zone and one detail zone —
pairing the two duration breakdowns in a tabbed container is the expected move.

## This rebuild also repairs the starved objects (ticket 09, folded in)

2 object(s) on this Sheet carry 18 property paths where a healthy one of the same type
carries 48-97. They mount, show their title and draw nothing. Rebuilding each in the Qlik
editor writes the full default set, so the repair comes free with the recomposition — which
is why ticket 09 was folded into 03-08 rather than done as separate programmatic work.

Starved here: `GSVRc` barchart, `STfaP` barchart.

Rebuild each one rather than editing it in place; an edit does not add the missing defaults.

**Blocked by:** 04 — Overview

**Status:** superseded 2026-09-21 by ADR 0004 — PaddlePoint draws analytics itself; the headless track (`.scratch/headless-qlik-analytics/`) carries this subject. The Sheet stays for Qlik Cloud exploration; its starved objects are unfixed.

- [ ] `sheetMode` is `RESPONSIVE`, 24×12, extension off
- [ ] Four KPIs, one hero; the KPI object is no longer 48 columns wide
- [ ] `Matches Missing Duration` still visible, not as a KPI tile
- [ ] Close Matches / High-scoring Matches tooltips still show the CONTEXT.md definitions
- [ ] `check-object-health.mjs` reports 0 starved objects on this Sheet
- [ ] Nothing scrolls inside the 850px embed frame at laptop width
