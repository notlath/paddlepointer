# 07 — Partnership Analysis

**What to build:** Partnership Analysis recomposed to `docs/qlik-sheet-design.md`. The test
of the template's sparse case: four objects today (filter pane, ranked table, scatter,
unranked table) at 24×20.

This Sheet is too sparse for the template, not too dense. Per the standard the KPI band is
left out and the trend zone moves up — the `Win % vs Matches Together` scatter takes it,
with the ranked and unranked tables in the detail zone. Invent nothing to fill the band.

Keep ticket 13's structure intact: ranked (3+ Matches together) and unranked are separate
script-level tables, not one calculated dimension, so a below-threshold Partnership is an
absent row rather than a null one. The unranked list must keep showing Matches together.

If the template reads badly on four objects, that is a finding about the standard — record
it and amend `docs/qlik-sheet-design.md`, do not pad the Sheet.

## This rebuild also repairs the starved objects (ticket 09, folded in)

Two tables here are starved — `zcJcHpU` and `KPnytP`, both 18 property paths against a
healthy table's 48 — so they mount, show their title and draw nothing. Rebuilding them in the
Qlik editor writes the full default set (ticket 09, folded into 03-08).

`dKJkxP`, the `Win % vs Matches Together` scatter, is the **only scatterplot in the app**, so
`check-object-health.mjs` has nothing to compare it against and reports UNKNOWN rather than
guessing. It sits at 18 paths like every starved object, so treat it as starved and rebuild
it. Once rebuilt it becomes the reference every future scatterplot is checked against —
which makes it worth getting right here.

Rebuild each one rather than editing it in place; an edit does not add the missing defaults.

**Blocked by:** 06 — Leaderboard, and the similar-names table moves out

**Status:** superseded 2026-09-21 by ADR 0004 — PaddlePoint draws analytics itself; the headless track (`.scratch/headless-qlik-analytics/`) carries this subject. The Sheet stays for Qlik Cloud exploration; its starved objects are unfixed.

- [ ] `sheetMode` is `RESPONSIVE`, 24×12, extension off
- [ ] KPI band omitted; no KPIs invented
- [ ] `check-object-health.mjs` reports 0 starved objects on this Sheet
- [ ] The rebuilt scatterplot no longer reports UNKNOWN; it is the reference now
- [ ] Ranked and unranked tables still driven by the two script-level tables
- [ ] Recorded here: whether the template holds on a sparse Sheet, and any amendment made
