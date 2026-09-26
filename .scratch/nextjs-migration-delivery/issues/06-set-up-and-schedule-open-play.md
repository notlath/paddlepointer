# 06: Set up and schedule Open Play

**What to build:** As an Admin, I want to configure a Tournament and generate a usable Schedule, so that Players can be assigned to Rounds, courts, and Tournament Matches for Open Play.

**Blocked by:** 04 Manage the Current Event; 05 Manage the Player directory.

**Status:** ready-for-agent

- [ ] Authorized staff can configure a Tournament's Players, courts, and scheduling inputs.
- [ ] The Schedule generator creates Rounds, court assignments, and Tournament Matches using the established scheduling behavior.
- [ ] Staff can inspect and adjust the generated Schedule before it is used for play.
- [ ] Scheduling validation surfaces unavailable or conflicting Players and other actionable input errors.
- [ ] Schedule and Tournament Match state persists in PostgreSQL and is protected by server-side authorization.
- [ ] Browser journeys cover valid scheduling, scheduling edge cases, and unauthorized changes.
