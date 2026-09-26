# 05: Leaderboard Analytics subject

**What to build:** Recreate the Leaderboard subject as a native, accessible standings experience driven by Qlik's governed all-Event ranking calculations. Staff can find a Player, inspect the complete ranking columns and make associative selections without loading or embedding a Qlik table.

**Blocked by:** 02: Native analytics session and selection shell.

**Status:** ready-for-agent

- [ ] The standings show Player, Matches, Wins, Losses, Win %, Points For, Points Against and Point Difference from the governed hypercube.
- [ ] Ranking order remains wins, then win rate, then point differential; JavaScript does not independently recalculate rankings.
- [ ] Player search/filtering participates in the shared QIX selection state.
- [ ] The table is paged, keyboard navigable, correctly labelled and usable at narrow widths.
- [ ] No decorative KPI cards are invented for this intentionally table-led subject.
- [ ] The similar-names data-quality table remains outside PaddlePoint's Analytics subjects and accessible through the Qlik Cloud handoff.
- [ ] One runnable automated check covers column mapping, order preservation and pagination.
