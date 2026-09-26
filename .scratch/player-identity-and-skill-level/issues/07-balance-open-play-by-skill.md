# 07 — Open Play Teams are balanced by Skill level

**What to build:** When staff Generate or Update a Schedule, the two Teams in each Match come out close in total Skill level. For example, Advanced + Beginner vs Intermediate + Intermediate, not Advanced + Advanced vs Beginner + Beginner. Courts still mix levels. Balance is traded off against the existing rules against repeat partners and opponents, not ranked above them. Fair sit-outs and equal Match counts are unchanged. Already-scheduled and played Matches are never reshuffled.

For balancing, Beginner, Intermediate and Advanced count as 1, 2 and 3. An Unrated Player counts as the average of the Tournament's rated Players. If nobody is rated, the Schedule is exactly what it is today.

**Blocked by:** 05 — Staff set a Player's Skill level

**Status:** done

- [x] For a mixed-level roster, generated Matches have a smaller average gap in Team level than today's scheduler produces with the same seed (covered by a test)
- [x] With every Player Unrated, the Schedule is identical to today's for the same seed (covered by a test)
- [x] On a realistic roster, repeat-partner and repeat-opponent counts stay within one of today's for the same seed
- [x] Unrated Players count as the average level of the rated Players in the Tournament
- [x] Update Schedule leaves locked and played Matches untouched and balances only new ones
- [x] A Skill level changed mid-Event has no effect until the next Generate or Update Schedule
