# 15 — Event / Court Analytics

**What to build:** Organisers compare Events and courts: participation per Event, Matches per Event, Matches per court, court utilization, average Match duration per Event, Players per Event, and the Event Leaderboard (the Leaderboard narrowed to one Event, per CONTEXT.md).

Court utilization is Match minutes played on a court divided by that Event's window (first Match start to last Match end) times one court. Matches with an unknown duration are excluded from utilization and from the average-duration figure, both counted separately, the same rule as ticket 07. Only Tournament Matches have courts, so standalone Matches don't count toward utilization.

**Blocked by:** 04 — Courts right now; 06 — Leaderboard

**Status:** done (2026-09-18)

- [x] The sheet shows participation, Matches, Players and average Match duration per Event
- [x] Matches per court and court utilization are shown, excluding unknown-duration Matches and reporting how many were excluded
- [x] Selecting one Event shows that Event's Leaderboard, using the ranking rules from ticket 06
- [x] Reuses the Master Items from ticket 06; consistent titles and KPI formatting; no pie charts; prefers tables and bar charts

## Implementation (2026-09-18)

No PHP or backend changes: built on ticket 06's `LeaderboardPlayers`/`LeaderboardResults`/`Player` model plus the `Events`/`EventWindow` tables already loaded for the "Courts right now" sheet — no new load-script tables.

**New Master Measures:**
- `Participation` = `Count({<[Leaderboard Winner]={'A','B'}>} [Leaderboard Team])` — total Player-Match slots filled (4 per doubles Match) across finished Matches, distinct from the headcount `Active Players` measure (ticket 14). Counts `[Leaderboard Team]` rather than `[Player Key]` deliberately — see "Bug found and fixed" below.
- `Court Utilization` = `Num((Sum({<[Duration Seconds]={">0"}>} [Duration Seconds])/60) / ((Timestamp#(Only([end]),'YYYY-MM-DDThh:mm:ss.fffZ') - Timestamp#(Only([start]),'YYYY-MM-DDThh:mm:ss.fffZ')) * 24 * 60), '0.0%')` — Match minutes played on a court (excluding unknown-duration Matches, per ticket 07's rule) divided by that Event's window in minutes. `[start]`/`[end]` come from the `EventWindow` table, associated to the Match's Event through the existing `Events` ↔ `LeaderboardResults`/`LeaderboardPlayers` `Event Id` association — a 3-table associative hop that works the same way ticket 06's own measures already rely on shared field names.

Everything else reuses existing Master Items: `Completed Matches` (ticket 14) for Matches-per-Event, Matches-per-Court, and the Court Utilization table's Matches column — kept consistent across all three since this whole sheet is about completed/duration-tracked play; `Active Players` (ticket 14) for Players-per-Event; `Average Duration` (ticket 07) for average Match duration; `Matches Missing Duration` (ticket 07) for the excluded-Match count; `Wins`/`Losses`/`Win %`/`Points For`/`Points Against`/`Point Difference` (ticket 06) for the Event Leaderboard; `Player`/`Event Id`/`Match Date` (ticket 06) for the dimension and filters. Tables/charts display `Event Name` (a plain existing field) rather than the raw `Event Id` for readability. The one deliberate exception is the Event Leaderboard's own `Matches` column, which reuses ticket 06's plain `Matches` measure (not `Completed Matches`) to faithfully mirror ticket 06's existing Leaderboard Standings table rather than introduce a subtly different number on what's meant to be the same view.

Standalone Matches (no Tournament Match, so no court) are excluded from the court-based objects via a calculated dimension — `=If(Not IsNull([Match Court]), [Match Court])` — same technique as ticket 14's Recent Matches table.

**Sheet** `Event / Court Analytics` (24 cols × 22 rows, rank 4):
- Filter pane: Event Id, Match Date.
- `Event Summary` table (dimension: Event Name): Participation, Players (Active Players), Matches (Completed Matches), Average Duration.
- `Matches per Court` bar chart (dimension: Court, excluding standalone Matches): Matches.
- `Court Utilization` table (dimensions: Event Name, Court): Utilization %, Matches, Matches Missing Duration.
- `Event Leaderboard` table (dimension: Player): Matches, Wins, Losses, Win %, Points For, Points Against, Point Difference — sorted Wins → Win % → Point Differential descending, ticket 06's own ranking rule. This is the same table shape as ticket 06's Leaderboard Standings; selecting one Event in the filter pane narrows it to that Event's Leaderboard automatically (no separate object needed).

## Bug found and fixed (2026-09-18)

While building `Participation`, found that a bare (non-`DISTINCT`) `Count()` over a field Qlik tags as a "key" (`[Player Key]` here — the `$key` tag, shared by `Player`, `Player Variations`, `LeaderboardPlayers`, `Partners`, `Opponents`, `Partnerships`) silently resolves against whichever table Qlik treats as that key's canonical source table — in this app, the deduplicated `Player` table (one row per key) — rather than the fact table (`LeaderboardPlayers`, many rows per key). A first attempt at `Participation` used `Count({<[Leaderboard Winner]={'A','B'}>} [Player Key])` and returned 11 (matching the distinct Player count) instead of the expected 44 (11 completed doubles Matches × 4 Players). Fixed by counting `[Leaderboard Team]` instead — a plain field that only lives in `LeaderboardPlayers`, so no ambiguity. None of tickets 06/07/12/13/14's existing measures are affected: they only ever use key fields (`Player Key`, `Leaderboard Match Id`) inside `Count(DISTINCT ...)`, which gives the same answer regardless of which table the aggregation resolves against.

## Verification (2026-09-18)

Checked every object's `getLayout()` for calc errors (none) and pulled live values with selections cleared:

- Event Summary: `Open Play` shows Participation 44, Players 11, Matches 11, Average Duration 01:48:24; a separate `-` (no Event Name) row with Matches 1 captures the already-documented (ticket 12/13/14) anomalous standalone Match.
- Matches per Court: Court 1 has 7 Matches, Court 2 has 4 — sums to 11, matching Open Play's Matches count; standalone and no-Court Matches correctly excluded from these bars via the calculated dimension.
- Court Utilization: Court 1 is 1.7% utilized (55 of ~3,276 minutes in the Event's ~2.3-day window), Court 2 is 34.7% (1,137 minutes) — no Matches excluded for missing duration on either real court.
- Event Leaderboard: 17 Players, correctly sorted (verified several Wins-tied groups break by Win % then Point Differential in the right order, e.g. within the 3 Players tied at 1 Win/25.0%, Point Differential 11 > 8 > 0 sorts them correctly).
- Did not visually confirm in-browser this session (no authenticated browser session available here); a human should eyeball the sheet's layout/readability at tablet width, same caveat as tickets 12–14.
