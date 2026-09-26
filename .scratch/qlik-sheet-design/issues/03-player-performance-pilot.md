# 03 — Player Performance: the template, proved on the worst Sheet

**What to build:** Player Performance recomposed to `docs/qlik-sheet-design.md`. This is the
pilot — the standard is unproven until one Sheet wears it, and this is the messiest Sheet
(24×28, seven KPI tiles, seven objects), so it stress-tests the template where it is hardest.

From seven KPIs to four: **Win %** as the hero (its own single-measure object), with
**Matches**, **Wins** and **Point Difference** beside it. Losses goes (Matches − Wins);
Points For and Points Against go (both are columns of the Match History table below, and
Point Difference is the number anyone compares on). Matches stays as Win %'s denominator.

The `Score Margin by Match` bar goes: it plots per-Match margin, which is the Match History
table's own Point Differential column. `Partner Performance` and `Opponent Results` move
into one tabbed container — two tables answering one question.

Result: 6 objects in 24×12, unextended. No Master Items are deleted; measures dropped from
the KPI band stay available for other Sheets.

## This rebuild also repairs the starved objects (ticket 09, folded in)

5 object(s) on this Sheet carry 18 property paths where a healthy one of the same type
carries 48-97. They mount, show their title and draw nothing. Rebuilding each in the Qlik
editor writes the full default set, so the repair comes free with the recomposition — which
is why ticket 09 was folded into 03-08 rather than done as separate programmatic work.

Starved here: `KqqEKw` linechart, `TBmZGDz` barchart, `tsgnpMp` table, `muwwT` table, `yePTMwB` table.

Rebuild each one rather than editing it in place; an edit does not add the missing defaults.

**Blocked by:** 02 — The PaddlePoint theme on every Sheet

**Status:** superseded 2026-09-21 by ADR 0004 — PaddlePoint draws analytics itself; the headless track (`.scratch/headless-qlik-analytics/`) carries this subject. The Sheet stays for Qlik Cloud exploration; its starved objects are unfixed.

- [ ] `sheetMode` is `RESPONSIVE`, 24×12, extension off
- [ ] Zones and slot sizes match the standard's diagram
- [ ] Hero Win % is a separate single-measure KPI object; the other three share one object
- [ ] Score Margin bar removed; Partner and Opponent tables share a tabbed container
- [ ] Nothing scrolls inside the 850px embed frame at laptop width
- [ ] `check-object-health.mjs` reports 0 starved objects on this Sheet
- [ ] Recorded with screenshots at laptop and tablet width
- [ ] Recorded here: anything the template got wrong, and the standard updated to match
