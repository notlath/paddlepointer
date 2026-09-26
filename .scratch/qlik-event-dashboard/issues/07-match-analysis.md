# 07 — Match Analysis

**What to build:** Organisers see how Matches are played across every Event: completed Matches, average Score and margin, average duration, Matches by day and by hour, Close Matches and High-scoring Matches (definitions in CONTEXT.md), and average duration per round and per court (folding in what was planned as a separate "Game pace" sheet).

Games with an unknown duration are left out of every duration average, and the sheet shows how many were left out — the 15-minute Leaderboard default is not used here, since a made-up duration would skew an average.

**Blocked by:** 04 — Courts right now; 06 — Leaderboard

**Status:** done (2026-09-17)

- [x] The sheet shows completed Match count, average Score, average margin and average duration, filterable by Date and Event
- [x] Matches with an unknown duration are excluded from duration averages, with a count of how many were excluded
- [x] The sheet breaks Matches down by day and by hour
- [x] The sheet shows Close Matches and High-scoring Matches using the CONTEXT.md definitions, with those definitions visible as tooltips
- [x] The sheet shows average duration per round and per court
- [x] Reuses the Master Items from ticket 06; consistent titles and KPI formatting; no pie charts; prefers tables, bar and line charts

## Progress (2026-09-17)

- `get-leaderboard-results` now returns nullable `round` and `court` values from the associated Tournament Match. Standalone Matches retain `null` values.
- Qlik script revisions added `[Match Round]`, `[Match Court]`, and `[Match Hour]`; reload `6aab656be758dbf000aba808` succeeded.
- Created the private `Match Analysis` sheet with Event and Match Date filters, a Match-count bar chart by day, and a Match-count line chart by hour. Removed the template pie chart and unused incomplete visual.

## Progress (2026-09-17, continued)

- Confirmed the backend already covered every remaining checkbox: `read_qlik_leaderboard_results()` in [leaderboard.php](../../../api/qlik/leaderboard.php) returns per-Match `teamAScore`/`teamBScore`/`targetScore`, `durationSeconds` (`null` when unknown), `round`/`court`, and `completedAt`. `tests/qlik_leaderboard_test.php` pins this; full PHP suite (33 files) passes. No PHP changes were needed.
- The Qlik MCP connector in this session is wired to an unrelated tenant and can't reach the PaddlePoint app, so the sheet was built directly against the Qlik Cloud Engine API (`wss://mtcmarketing.sg.qlikcloud.com/app/...`) via `enigma.js`, authenticated with the API key at `.scratch/qlik-event-dashboard/qlik_token.txt`. Tooling lives outside the repo, in the session scratchpad.
- Added Master Measures `Avg Score`, `Avg Margin`, and `Matches Missing Duration` (description: "Completed Matches left out of every duration average because no duration was recorded").
- **Bug found and fixed in this Qlik engine build:** `Abs()` always returns null (confirmed even on a literal `Abs(-5)`); `fabs()` works correctly. This had already broken the pre-existing `Close Matches` master measure (created for ticket 07 before this session, evaluating to `-` for every selection). Rewrote both the new `Avg Margin` measure and the existing `Close Matches` measure to use `fabs()`. `High-scoring Matches` was unaffected (no subtraction).
- Populated the sheet's previously-empty KPI object with 7 tiles: Matches, Avg Score, Avg Margin, Average Duration, Matches Missing Duration, Close Matches, High-scoring Matches (widened from 12 to 48 grid columns to fit). `Close Matches`/`High-scoring Matches` already carried CONTEXT.md-worded descriptions, which Qlik renders as the tile's tooltip.
- Added the `Average Duration` measure to the existing `Match Court` × `Match Round` table (was skeleton-only, no measure).
- Added two new bar charts, `Avg Duration by Round` (dimension `Match Round`) and `Avg Duration by Court` (dimension `Match Court`), since the ticket asks for both breakdowns independently and the existing table only gives their cross-tab.
- Verified every object's dimensions/measures and pulled live computed values straight from the engine (e.g. 13 completed Matches, Avg Score 7.96, Avg Margin 7.42, Close Matches 2, High-scoring Matches 2, 1 Match missing duration) — all read as expected.
- Visually confirmed in-browser (user signed in) at mobile-list, tablet (768px), and wide-desktop (1600px) widths. Initial 7-tile KPI was visibly cramped, so split it: the original `VZmFqyH` KPI now holds the 5 completed-Match stats (Matches, Avg Score, Avg Margin, Average Duration, Matches Missing Duration), and a new KPI holds just Close Matches / High-scoring Matches so their tooltip-bearing numbers get more room. Widened the Match Court/Round table from 12 to 24 grid columns. Row is now table (24) + stats KPI (36) + highlight KPI (24) = 84. Confirmed readable at tablet width per ticket 06's bar.
