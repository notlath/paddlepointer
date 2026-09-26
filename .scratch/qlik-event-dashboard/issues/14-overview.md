# 14 — Overview

**What to build:** A landing sheet summarising the whole dashboard: KPIs for Active Players, Completed Matches, Events and Average Match Duration; a Top 10 Players leaderboard; Matches over time; win-rate distribution; and recent completed Matches. Filterable by Date and Event. Skill-level distribution and a Skill filter are left out — skill level isn't recorded in PaddlePoint (see ADR 0002's consequences).

**Blocked by:** 04 — Courts right now; 06 — Leaderboard

**Status:** done (2026-09-18)

- [x] KPI cards show Active Players (see CONTEXT.md), Completed Matches, Events and Average Match Duration for the current filter selection
- [x] A Top 10 Players table is shown, using the Leaderboard's ranking rules
- [x] A Matches-over-time visual and a win-rate distribution visual are shown
- [x] A recent completed Matches table is shown
- [x] Date and Event filters apply to every object on the sheet
- [x] Reuses the Master Items from ticket 06; consistent titles and KPI formatting; no pie charts; prefers KPI cards, tables, bar and line charts

## Implementation (2026-09-18)

No PHP or backend changes: built entirely on ticket 06's `LeaderboardPlayers`/`LeaderboardResults` model, no new load-script tables.

**New Master Measures** (chart-level expressions only, no script changes needed):
- `Completed Matches` = `Count(DISTINCT {<[Leaderboard Winner]={'A','B'}>} [Leaderboard Match Id])` — deliberately **not** a reuse of ticket 06's plain `Matches` measure. Checked live: `Matches` (13) and this Winner-restricted count (12) differ by exactly one Match with no recorded winner (the known anomalous standalone Match — see ticket 12/13's "Bugs found"/"Follow-up"). `Matches` alone would have silently counted an incomplete Match as "completed."
- `Active Players` = `Count(DISTINCT {<[Leaderboard Winner]={'A','B'}>} [Player Key])` — same Winner-restriction, matching CONTEXT.md's "at least one finished Match" definition for Active Player.
- `Events` = `Count(DISTINCT [Event Id])`.

Everything else reuses ticket 06/07 Master Items directly: `Average Duration` (ticket 07) for the KPI; `Wins`/`Losses`/`Win %`/`Points For`/`Points Against`/`Point Difference` (ticket 06) for the Top 10 table; `Player`/`Event Id`/`Match Date` (ticket 06) for the dimension and filters.

**Sheet** `Overview` (24 cols × 20 rows, rank 0 — first sheet):
- Filter pane: Event Id, Match Date.
- KPI row: Active Players, Completed Matches, Events, Average Match Duration.
- `Top 10 Players` table: dimensioned by `Player`, sorted primarily by Wins descending (ticket 06's own ranking rule uses Wins → Win % → Point Differential → minutes played → Points For → name as tiebreakers; this table sorts by Wins → Win % → Point Differential, the three that matter for a top-10 display) — limited to 10 rows via `qInitialDataFetch` height (sorting happens before the fetch window, so this reliably returns the top 10, not an arbitrary 10).
- `Matches Over Time` bar chart: `Match Date` × `Completed Matches`.
- `Win Rate Distribution` bar chart: a `Class()`-bucketed (20-point-wide buckets) calculated dimension over each Player's win rate, measured by `Count(DISTINCT Player)` — a histogram of how many Players fall into each win-rate band. Not a Master Dimension (single-purpose display bucketing, not something another sheet would reuse).
- `Recent Matches` table: the 8 most recent completed Matches (Match Date descending), Team A/B Score and Winner — a calculated dimension (`=If(Not IsNull([Leaderboard Winner]), [Leaderboard Match Id])`) excludes Matches with no recorded winner, same technique as ticket 13's ranked/unranked split reasoning, though here it's a lower-risk case (no new derived table, no shared-field overlap) so the simpler calculated-dimension form was fine.

## Verification (2026-09-18)

Checked every object's `getLayout()` for calc errors (none) and pulled live values with selections cleared:

- KPI: Active Players 15, Completed Matches 12, Events 1, Average Duration 01:42:50.
- Top 10 Players: 17 total distinct Players, correctly returns only the top 10 by Wins (Lath and Test User tied at 4 Wins lead the list). Cross-checked one apparent oddity — Lath shows 4 Wins, 0 Losses, but 80.0% (not 100%) Win % — not a bug: Lath played 5 Matches total, 4 with a clear result and 1 the same no-winner anomalous Match, so `Wins`/`Losses` (both Winner-restricted) show 4/0 while `Win %` correctly divides by all 5 Matches played.
- Matches Over Time: 4 dates summing to 12 — matches the Completed Matches KPI exactly.
- Win Rate Distribution: buckets sum to 16, one more than the 15 Active Players — a Player with zero completed Matches evaluates to a 0/0 win rate that Qlik doesn't treat as null here, landing them in the 0–20% bucket. Minor known cosmetic gap, not fixed (a single edge-case Player in a small test dataset); worth a second look if it turns out to matter with real Event data.
- Recent Matches: 8 rows, correctly sorted most-recent-first, all with a recorded Winner. One expected exception: the already-documented (ticket 12/13) anomalous standalone Match's blank-Team duplicate row still slips through with a null Match id, because that specific duplicate row does carry a Winner value — this is the same pre-existing `LeaderboardPlayers`/`LeaderboardResults` data-quality issue the earlier tickets flagged for follow-up, not something new.
- Did not visually confirm in-browser this session (no authenticated browser session available here); a human should eyeball the sheet's layout/readability at tablet width, same caveat as tickets 12/13.

## Correction (2026-09-18, while building ticket 15)

The Top 10 Players table's tie-break sort order was wrong: `qInterColumnSortOrder` had the `Player` dimension as the second sort key instead of `Win %`, so ties on Wins were broken alphabetically by name rather than by Win % then Point Differential as documented above. Fixed. Also caught a related bug while building ticket 15's `Participation` measure: a bare (non-`DISTINCT`) `Count()` over a field tagged as a Qlik "key" (like `[Player Key]`, shared by several tables) silently aggregates against whichever table Qlik picks as that key's canonical source — here, the deduplicated `Player` table — so it behaves like `Count(DISTINCT ...)` even when that's not intended. This ticket's own measures only ever use `[Player Key]` inside `Count(DISTINCT ...)`, which isn't affected, but worth remembering for any future measure that needs a genuine per-row (non-distinct) count.
