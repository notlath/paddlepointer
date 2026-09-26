# 12 — Player Performance

**What to build:** Organisers and staff select one Player and see their record: Matches, Wins, Losses, Win %, Points For, Points Against and Point Difference, plus performance over time, Match history, score margin, partner performance, and opponent results where the data allows it. Built from the players and results data loaded in ticket 06, across every Event with Date and Event filters.

**Blocked by:** 06 — Leaderboard

**Status:** done (2026-09-18)

- [x] A Player selector filters every object on the sheet to that Player's Matches
- [x] The sheet shows Matches, Wins, Losses, Win %, Points For, Points Against and Point Difference for the selected Player
- [x] A performance-over-time visual and a Match history table are shown
- [x] A score-margin visual is shown
- [x] Partner performance (this Player's record with each Partnership) and opponent results are shown, using only Partnerships/opponents the Player has actually faced
- [x] Reuses the Master Items from ticket 06; consistent titles and KPI formatting; no pie charts; prefers tables, bar and line charts; sized to stay usable on a tablet

## Implementation (2026-09-18)

No PHP or backend changes: the players/results endpoints from ticket 06 already carry everything needed (Match Id, Event Id, Team, Player, and per-Match Team A/B Scores and Winner).

**Qlik load script** (new `Player Performance` tab, after `Leaderboard`):
- `Partners`: self-join of `LeaderboardPlayers` on (Match, Team), restricted to `Team = 'A' OR Team = 'B'` and excluding the Player's own row — the other Player(s) recorded on the same Team in the same Match.
- `Opponents`: `LeaderboardPlayers` split into Team A / Team B rows, cross-joined on Match Id, doubled to be symmetric — every Player recorded on the other Team in the same Match.
- `Partner`/`Opponent` display names come from a `Player Key` → `Player` mapping (`ApplyMap`), reusing ticket 06's canonical/case-insensitive name grouping.
- Win/Loss/Points measures for the Partner Performance and Opponent Results tables are **not** custom fields — they directly reuse ticket 06's own `Wins`/`Losses`/`Win %`/`Points For`/`Points Against`/`Point Difference` master measures, dimensioned by `Partner`/`Opponent`. Those measures already resolve the selected Player's own Team via the shared `Leaderboard Match Id` + `Player Key` association, exactly like the KPI row does when a Player is selected — no new fields needed. (An earlier version of this ticket introduced per-row `Player Won Match`/`Player Score For`/`Player Score Against` fields duplicated identically across `Partners` and `Opponents`; see "Bugs found and fixed" below for why that was wrong and was removed.)

**New Master Dimensions:** `Partner`, `Opponent`.

**New Master Measure:** `Match Result` (Won/Lost, used by the Match History table).

**Sheet** `Player Performance` (24 cols × 28 rows): filter pane (Player, Event Id, Match Date) · KPI row reusing ticket 06's 7 measures (Matches, Wins, Losses, Win %, Points For, Points Against, Point Difference) · `Win % Over Time` line chart and `Score Margin by Match` bar chart (both by Match Date) · `Match History` table (one row per Match: Result, Points For/Against, Point Differential) · `Partner Performance` and `Opponent Results` tables (dimensioned by the new `Partner`/`Opponent` Master Dimensions, measured with ticket 06's own Matches/Wins/Losses/Win %/Point Difference) side by side.

## Bugs found and fixed (2026-09-18)

Two real correctness bugs surfaced while verifying ticket 13's Partnership Analysis (which builds directly on this ticket's `Partners` table) — both are fixed in the live app now:

1. **Blank-Team rows self-pairing.** One standalone Match (`Event Id` is null) has every Player duplicated in `LeaderboardPlayers` — once with a real `Team` ('A'/'B') and once with a blank/null `Team`. Confirmed via raw HTTP + ngrok inspection that the PHP endpoint itself returns clean, non-duplicated rows for this Match every time, so the duplication is introduced somewhere in Qlik's own REST-to-table load for this specific row shape (worth a follow-up investigation, out of scope here). The `Partners` self-join didn't restrict `Team` to 'A'/'B', so the blank-Team duplicates self-paired, producing an impossible 200% win rate for one pairing. Fixed by adding `WHERE [Leaderboard Team] = 'A' OR [Leaderboard Team] = 'B'` to the self-join's two source loads.
2. **Synthetic key from duplicated field names.** The original design added `Player Won Match`, `Player Score For`, and `Player Score Against` as per-row fields on **both** `Partners` and `Opponents` (and, for ticket 13, a third table `Partnerships`) under identical names. Three tables sharing two-or-more identical field names is exactly what makes Qlik form a synthetic key — and once ticket 13 added the third table, aggregates against these fields became inconsistent and query-shape-dependent (the same "Matches"/"Wins" expression gave different answers depending on which other fields were in the same chart, occasionally showing wins that exceeded matches played). Fixed by deleting those three duplicated fields entirely and re-pointing every Partner/Opponent/Partnership breakdown at ticket 06's own Wins/Losses/Points measures instead (see Implementation above) — those never needed a custom field in the first place. Also deleted the now-orphaned `Matches (H2H)`/`Wins (H2H)`/`Losses (H2H)`/`Win % (H2H)`/`Point Differential (H2H)` master measures this bug had produced.

Also worth noting for future sessions: this Qlik Cloud app's `openDoc()` sessions are **not** isolated from each other — an unsaved `setScript()` or an active field selection made in one Node/enigma.js session is visible to the next session opened against the same app id, and can get persisted by a later, unrelated `doSave()` call. A "throwaway" diagnostic script that doesn't explicitly call `doc.clearAll()` (or that calls `setScript` without immediately reloading+discarding) can leak into the next script's baseline. Several confusing/contradictory readings during this session's debugging turned out to be exactly this — a stale selection or an unsaved debug script tab bleeding across sessions, not a data problem.

## Data pipeline gotcha found and fixed (2026-09-18)

The Qlik REST connections pull from `http://paddlepoint.test/api/qlik/*` through an **ngrok tunnel** (see ticket 03 — Qlik Cloud can't reach a local-only hostname). That tunnel was from a prior session and no longer running; starting a new one and re-pointing the Qlik connections at its throwaway URL are both actions this session's auto-mode classifier hard-blocks (`External Ingress Tunnel`, `Credential Materialization`) regardless of confirmation, so the user did those two steps themselves.

Even after that, the first reload still came back with **zero rows across every table** (not just the new ones — confirmed against pre-existing `Events`/`Matches` tables too). Cause: earlier this session `herd secure paddlepoint` was run to fix an unrelated local HTTPS check, which — as a side effect — turned on a forced HTTP→HTTPS redirect for the site's nginx config. ngrok's tunnel targets plain `http://localhost:80`; against the redirect, every REST connector request came back `301 Moved Permanently` to `https://paddlepoint.test/...` (a local-only, externally-unreachable host), which Qlik's REST connector silently treated as zero rows rather than an error. Fixed with `herd unsecure paddlepoint` (restores plain HTTP, matching ticket 03's original working setup) — confirmed via `curl` that the endpoint then serves JSON directly with no redirect, and the next reload loaded real data (56 Leaderboard-Player rows, 16 Players, 48 Partner rows, 98 Opponent rows). **Worth remembering for tickets 13+**: don't run `herd secure` against this site while the ngrok pipeline is in use.

## Verification (2026-09-18)

Checked every object's `getLayout()` for calc errors (none) and pulled live computed values straight from the engine, same approach as tickets 06/07, after the two bug fixes above and with selections explicitly cleared (`doc.clearAll()`) before every check:

- Selecting Player `Test User 3` (16 completed Matches total in the dataset by this point): KPI showed Matches 4, Wins 1, Losses 3 — cross-checked line by line against that Player's 4 rows in the Match History table.
- Partner Performance table for the same Player: 4 rows (one partner per Match, doubles), Matches summing to 4 and Wins summing to 1 — consistent with the KPI totals.
- Opponent Results table: 6 distinct Opponents, Matches summing to 8 (2 opponents × 4 Matches) and Wins summing to 2 (each of the Player's 1 real win counted once per opponent faced in that Match) — the expected doubling for a doubles Opponent breakdown, not a bug.
- Unfiltered (no Player selected), every row in both the Partner Performance and Opponent Results tables has Wins + Losses ≤ Matches and a Win % between 0–100%, with one exception: a stray `-` (null-dimension) row appears in both tables' raw hypercube data, absorbing whichever Matches/Players don't have a resolvable Partner/Opponent (the one anomalous blank-Team standalone Match from "Bugs found and fixed" above, plus — expected and unavoidable in an associative model — any genuinely partner-less/opponent-less row). `qSuppressMissing` is set on both objects, which is the standard way to hide this in the rendered Qlik client; this session had no authenticated browser to visually confirm the null row is actually hidden there, so a human should double-check it next time someone is signed in.
- Did not visually confirm in-browser this session (no authenticated browser session available here); a human should also eyeball the sheet's layout/readability at tablet width per ticket 06's usability bar next time someone is signed in.
