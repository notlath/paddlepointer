# 02 — Generating a schedule stays fast for large player lists

**What to build:** A Super Admin can generate or regenerate an Open Play schedule for a large player list without the page freezing. Today the scheduler re-scores every possible four-player group for each Match it picks: a benchmark measured 2.5 s at 32 players, 7.9 s at 40 and 20.7 s at 48 (in Node, which uses the same engine as Chrome). Replace that search with one whose cost grows with the number of players, not the number of possible four-player groups, while keeping every fairness rule 01 tests.

Origin: architecture review candidate C7.

**Blocked by:** 01 — Open Play scheduler lives in its own tested module

**Status:** completed

- [x] Generating for 48 players, 4 Courts and 4 games each takes under 200 ms in Node
- [x] Generating for 100 players takes under 2 seconds in Node
- [x] All fairness tests from 01 still pass, including regeneration with locked Matches
- [x] Partner variety is at least as good as today's for 16 and 32 players, measured by the most times any two players are partnered
