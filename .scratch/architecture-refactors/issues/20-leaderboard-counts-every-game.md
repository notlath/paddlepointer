# 20 — The Leaderboard counts every Game

**What to build:** Leaderboard totals are worked out on the server across every completed Game the viewer is allowed to see. Today the browser works them out from only the newest 200 Games, so saving Game #201 quietly pushes Game #1 out of the standings.

Origin: architecture review candidate C3.

**Blocked by:** 17 — Games record their Tournament, Match and players; 06 — History goes through a handler with visibility tests per role (each viewer's Leaderboard counts only the Games they may see)

**Status:** ready-for-agent

- [ ] A test with 250 completed Games shows the oldest Game counted
- [ ] Standings keep today's ordering: most wins, then win rate, then point difference, then minutes played, then points scored, then name
- [ ] Each viewer's Leaderboard counts the same Games they're allowed to see in History
- [ ] The Leaderboard page shows the same player and team tables as today
