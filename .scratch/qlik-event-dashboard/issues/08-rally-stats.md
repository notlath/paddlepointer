# 08 — Rally stats

**What to build:** Organisers see how Matches were contested. Each results row (ticket 06) gains totals worked out from the Match's Rally log: side-outs, Rally count, and the longest scoring run for Team A and for Team B. A scoring run is the most points one Team scored in a row. The Match Analysis sheet (ticket 07) gains side-outs per Match, Rallies per point (total Rallies divided by total points), and the longest scoring runs.

"Points won on serve" is deliberately left out. Only the serving Team can score, so it would always equal the Score.

**Blocked by:** 07 — Match Analysis

**Status:** done (2026-09-17)

- [x] Each results row includes side-outs, Rally count, Team A longest run and Team B longest run
- [x] PHP tests cover a Match with known Rallies, including a run broken by a side-out, and a Match with no Rallies recorded
- [x] The Match Analysis sheet shows side-outs per Match, Rallies per point and longest runs, across every Event

## Progress (2026-09-17)

- `qlik_rally_stats()` in [leaderboard.php](../../../api/qlik/leaderboard.php) parses each Game's Rally log (`events`, from `rally-engine.js`) and returns `sideOuts`, `rallyCount`, `teamALongestRun`, `teamBLongestRun`; `qlik_leaderboard_result_row()` now includes all four. `rallyCount` is just `count(events)` (every logged event is one Rally per CONTEXT.md). A scoring run increments on a `point` event for that Team and resets to 0 for both Teams on a `side-out`; a `server-switch` (first fault, doubles) does nothing, since the Team keeps serving through one — this is why the ticket's "broken by a side-out" case matters and server-switches don't count as breaks.
- Added two tests to `tests/qlik_leaderboard_test.php`: a Match with a crafted Rally log (side-out breaks a run of 2, a later run of 3 becomes the longest) and a Match with no Rally log (`events` omitted) reporting all zeros. Full PHP suite (35 files) passes.
- Confirmed the live endpoint (through the user's ngrok tunnel to their local Herd server) already served the new fields with real data before touching Qlik.
- **Qlik-side, with the user's explicit go-ahead** (editing/reloading the shared app needed confirmation): added `sideOuts`/`rallyCount`/`teamALongestRun`/`teamBLongestRun` to the `LeaderboardResultsMasterTable` REST SELECT and the `[LeaderboardResults]` LOAD as `[Side Outs]`, `[Rally Count]`, `[Team A Longest Run]`, `[Team B Longest Run]`; reloaded the app and confirmed all four fields exist.
- Added four Master Measures (`Side-outs per Match` = `Avg([Side Outs])`, `Rallies per Point` = `Sum([Rally Count]) / (Sum([Team A Score]) + Sum([Team B Score]))`, `Team A Longest Run` = `Max([Team A Longest Run])`, `Team B Longest Run` = `Max([Team B Longest Run])`) and verified each against hand-computed totals from the live API data (8.8, 1.84, 11, 11 — all matched).
- Added two 2-tile KPIs to `Match Analysis` — `Rally Rates` (Side-outs per Match, Rallies per Point) and `Longest Scoring Run` (Team A, Team B) — rather than one 4-tile KPI, since a single multi-measure KPI always renders its first measure huge and the rest as small sublabels (the same issue fixed on ticket 07's KPI row); paired tiles read evenly. Visually confirmed at tablet width.
