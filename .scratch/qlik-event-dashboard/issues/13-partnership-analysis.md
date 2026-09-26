# 13 — Partnership Analysis

**What to build:** Organisers see which Partnerships (pairs of Players who have shared a Team) perform best, without a single lucky Match looking like the best pairing. A Partnership is ranked only once it reaches at least 3 Matches together (see CONTEXT.md); the sheet always shows Matches together next to any ranking, and Partnerships below the threshold appear in a separate "not enough Matches" list rather than being hidden or ranked.

Reverses the app's "no team table" position from ADR 0001; see ADR 0002's consequences.

**Blocked by:** 06 — Leaderboard

**Status:** done (2026-09-18)

- [x] Partnerships are identified by their two Player names regardless of which Team or Match they shared
- [x] The ranked table shows Matches together, Wins together, Losses together, Win % and Point Differential, for Partnerships with 3+ Matches together
- [x] Partnerships with fewer than 3 Matches together appear in a separate, unranked list, still showing Matches together
- [x] A win % vs Matches-together scatter plot is shown for ranked Partnerships
- [x] Reuses the Master Items from ticket 06; consistent titles and KPI formatting; no pie charts; prefers tables and a scatter plot

## Implementation (2026-09-18)

No PHP or backend changes: built entirely on ticket 12's `Partners` table.

**Qlik load script** (new `Partnership Analysis` tab, after `Player Performance`):
- `Partnerships`: one row per Match per **unordered** pair, built from ticket 12's `Partners` table filtered to `WHERE [Player Key] < [Partner Key]` (a canonical direction — each pair's two Players are compared alphabetically by their canonical key, so only one of the two directional `Partners` rows per Match survives). This is what makes `Count(DISTINCT [Leaderboard Match Id])` count a Partnership's Matches together once, not once per Player. The `Partnership` display field is the two canonical Player names joined with `' & '`.
- `RankedPartnerships` / `UnrankedPartnerships`: two more script-level tables (not a single calculated-dimension `If()`), each a plain `WHERE`-filtered `RESIDENT` load off a `Partnerships`-derived per-partnership Match count (`GROUP BY [Partnership]`) — `>= 3` and `< 3` respectively. Deliberately not done as `=If(Aggr(Count(...),[Partnership])>=3,[Partnership])` on a single dimension: a below-threshold row there still exists as a genuine table row with a null dimension value, which a raw hypercube read shows as a `-` row (see ticket 12's "Bugs found and fixed" for why relying on `qSuppressMissing` alone wasn't something this session could visually confirm). With two real tables, a non-qualifying Partnership is simply an absent row, not a null one.
- Win/Loss/Points measures reuse ticket 06's own Wins/Losses/Win %/Points For/Points Against/Point Difference master measures, exactly like ticket 12's Partner/Opponent tables — no custom fields, for the same synthetic-key reasons documented in ticket 12.

**New Master Dimensions:** `Partnership` (all Partnerships, reusable elsewhere), `Ranked Partnership` (3+ Matches together), `Unranked Partnership` (fewer than 3).

**Sheet** `Partnership Analysis` (24 cols × 20 rows): filter pane (Event Id, Match Date) · `Ranked Partnerships (3+ Matches Together)` table (Matches, Wins, Losses, Win %, Point Differential, sorted by Win % descending) and `Win % vs Matches Together` scatter plot side by side, dimensioned by `Ranked Partnership` · `Other Partnerships (Fewer than 3 Matches)` table (just Matches together) below, dimensioned by `Unranked Partnership`.

## Verification (2026-09-18)

With selections cleared (`doc.clearAll()`) and no calc errors on any object:

- `Other Partnerships`: 24 distinct Partnerships, every one with exactly 1 Match together — matches this small local test dataset, where no pair has played together 3+ times yet.
- `Ranked Partnerships`: correctly empty of any real Partnership (none has reached the 3-Match threshold in this dataset) — same caveat as ticket 12 about not being able to visually confirm the raw hypercube's stray `-` row is actually hidden in the rendered Qlik client (no authenticated browser available this session).
- Cross-checked the Partnerships table's per-pair Matches/Wins/Losses against ticket 06's own measures for a few pairs by selecting each Player individually — consistent (e.g. a pair with 1 Match and a recorded winner shows exactly one Win and one Loss between the two Partner-Performance-table views of that Match, never both Won).
- Did not visually confirm in-browser this session; a human should eyeball the sheet's layout/readability at tablet width, and re-check once real data accumulates 3+ Matches for at least one Partnership, before calling this done for a live Event.

## Follow-up spotted, not fixed here

While debugging ticket 12/13, found that `LeaderboardPlayers` has duplicate rows (a real Team row plus a spurious blank/null-Team row) for at least one standalone Match (`Event Id` null). Confirmed via direct `curl` through the same ngrok tunnel that the PHP endpoint itself returns clean, non-duplicated rows for that Match every time — so the duplication is introduced somewhere in Qlik's own REST-to-table load, not the backend. Ticket 12's `Partners`/`Opponents` tables now defensively exclude blank-Team rows, but the core `LeaderboardPlayers` table (ticket 06) and anything built directly on it (e.g. Match History's Points For/Against for that one Match) still sees the duplicate. Worth a dedicated investigation — possibly related to how Qlik's REST connector parses a JSON array where some rows have a null field (`eventId` is null only for standalone Matches).
