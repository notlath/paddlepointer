# 19 — History lists send summaries

**What to build:** History and home-page lists receive Game summaries (teams, players, score, winner, times, Tournament) instead of full Games carrying every Rally. A Game's full Rally log loads only when its Summary opens.

Origin: architecture review candidate C3.

**Blocked by:** 18 — The server decides which Games each viewer sees

**Status:** ready-for-agent

- [ ] History lists show the same information as today
- [ ] A History list response no longer includes Rally logs
- [ ] Opening a Game's Summary loads its full Rally log and shows it as it does today
- [ ] Visitors' Games saved only in the browser still appear alongside shared ones
- [ ] The Leaderboard still works from summaries until 20 moves it to the server
