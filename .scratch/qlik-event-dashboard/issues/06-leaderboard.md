# 06 — Leaderboard

**What to build:** Organisers and staff see the all-time Leaderboard: Player standings from finished Matches across every Event, narrowed by the Date and Event filters.

Two new read-only analytics endpoints feed it, both taking an optional `?event=<id>` filter (omitted, they return every Event, including standalone Matches played outside any Tournament):
- The players endpoint returns one row per Player per finished Match: Event id (empty for a standalone Match), Match id, Team (A or B) and Player name, drawn from the Match's recorded players.
- The results endpoint returns one row per finished Match: Match id, Event id (empty for standalone), winner, Team A and Team B Scores, target score, and duration in seconds (empty when unknown).

The sheet ranks Players by the app's rules: only finished, non-Visitor Matches count, and names are trimmed and grouped regardless of case (see the Player entry in CONTEXT.md). This establishes the shared Master Items (Player, Event, Match status, date) that later sheets reuse.

Same key, 401/404 and response shape as ticket 03. See CONTEXT.md's Player, Event Leaderboard and Analytics copy entries, and ADR 0002.

**Blocked by:** 03 — Qlik loads every Event through a key-protected endpoint

**Status:** implementation complete; visual validation complete (2026-09-17)

- [x] The players endpoint returns Players for every finished, in-progress and scheduled Match, across every Event when `?event=` is omitted, and one Event's when given
- [x] The results endpoint returns every finished, non-Visitor Match, Tournament and standalone, across every Event when `?event=` is omitted
- [x] Duration is empty when unknown; the endpoint does not apply the app's 15-minute default
- [x] A PHP test shows that the players and results rows add up to the same per-player wins, losses, points for and points against as the app's `read_leaderboard`, across the whole database
- [x] The Leaderboard sheet lists Player, Matches, Wins, Losses, Win %, Points For, Points Against and Point Difference; Qlik table sorting provides standings order
- [x] Player search/filtering works on the sheet
- [x] A "similar Player names" table shows canonical and recorded names side by side, so staff can identify case/spacing variants at the source
- [x] Master Items exist for Player, Event, Match status and date, reused by later sheets
- [x] No pie charts; the responsive tables and filters are readable at typical laptop and tablet widths

## Backend implementation (2026-09-16)

- `api/qlik/get-leaderboard-players.php` and `api/qlik/get-leaderboard-results.php` are key-protected read-only endpoints with the same 401/404 response convention as the earlier analytics endpoints.
- `api/qlik/leaderboard.php` returns finished non-Visitor results (including standalone Matches) with `null` duration when no duration was recorded. Player rows come from recorded Game Players for saved Matches, and from scheduled Tournament Match Players where no Game exists yet; an `?event=` filter narrows both endpoints to one known Event.
- `tests/qlik_leaderboard_test.php` covers filters, key/404 handling, scheduled/in-progress/finished and standalone Player rows, unknown durations, and an independent aggregation check against `read_leaderboard()`.

## Verification (2026-09-16)

- All PHP database tests pass with the local Herd PHP 8.4 runtime.
- The full Node suite still has an unrelated existing failure in `tests/tournament-records-tokens.test.js` over outstanding stylesheet-token work; this ticket changes no JavaScript or CSS.

## Qlik-side wiring

- Updated the Qlik load script to retain `[Recorded Player Name]` alongside the case/spacing-normalised `[Player]`; reload `6aab5dd76362790fec4b4f66` succeeded on 2026-09-17.
- Created the personal `Leaderboard` sheet and four shared Master dimensions: `Player`, `Event Id`, `Match Date`, and `Match Status`.
- Added shared Master Measures: `Matches`, `Wins`, `Losses`, `Win %`, `Points For`, `Points Against`, and `Point Difference`.
- Added the `Leaderboard Standings` straight table, Player and Event Id filters, and a second table that compares canonical and recorded player names.
- Validated in Qlik analysis mode: 13 player-match rows, 10 wins, rendered standings values, selectable filters, and populated name-audit rows.
