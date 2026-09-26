# 06 — Leaderboard, and the similar-names table moves out

**What to build:** Leaderboard recomposed to `docs/qlik-sheet-design.md`, and its "similar
Player names" table moved off it.

That table exists so staff can spot case and spacing variants at the source (ticket 06). It
is data hygiene, not analytics, and it currently sits on the Sheet staff open to read
standings. Move it to a separate Sheet that stays Qlik-Cloud-only — not added to
`QLIK_SHEETS`, so it never appears in PaddlePoint's tab list. Do not delete it.

What is left is one wide standings table (Player, Matches, Wins, Losses, Win %, Points For,
Points Against, Point Difference) plus Player search. A single table is legitimately sparse
for the template — per the standard, an empty zone is left out and the next zone moves up.
Do not invent KPIs to fill the band.

## Nothing to repair here

Leaderboard is the one Sheet with no starved objects — its two `sn-table`s carry 51 and 57
property paths and it is the control that proves the render harness works. The ticket 09
repair folded into 03-08 does not apply. Keep it that way: `check-object-health.mjs` gates
`sn-table` too, so its 0-starved result here is a real check, not a vacuous one.

**Blocked by:** 05 — Match Analysis

**Status:** superseded 2026-09-21 by ADR 0004 — PaddlePoint draws analytics itself; the headless track (`.scratch/headless-qlik-analytics/`) carries this subject. The Sheet stays for Qlik Cloud exploration; its starved objects are unfixed.

- [ ] The similar-names table lives on its own Sheet, absent from `QLIK_SHEETS`
- [ ] Staff can still reach it in Qlik Cloud; recorded here how
- [ ] `sheetMode` is `RESPONSIVE`, 24×12, extension off
- [ ] Filter pane at 4×12, left column
- [ ] `check-object-health.mjs` reports 0 starved objects on this Sheet
- [ ] No KPIs invented to fill the band
