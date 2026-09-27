# 06: Set up and schedule Open Play

**What to build:** As an Admin, I want to configure a Tournament and generate a usable Schedule, so that Players can be assigned to Rounds, courts, and Tournament Matches for Open Play.

**Blocked by:** 04 Manage the Current Event; 05 Manage the Player directory.

**Status:** implemented

- [x] Authorized staff can configure a Tournament's Players, courts, and scheduling inputs.
- [x] The Schedule generator creates Rounds, court assignments, and Tournament Matches using the established scheduling behavior.
- [x] Staff can inspect and adjust the generated Schedule before it is used for play.
- [x] Scheduling validation surfaces unavailable or conflicting Players and other actionable input errors.
- [x] Schedule and Tournament Match state persists in PostgreSQL and is protected by server-side authorization.
- [x] Browser journeys cover valid scheduling, scheduling edge cases, and unauthorized changes.

The Next.js server calls the existing `buildOpenPlayMatches` scheduler. Tournament setup, roster availability, Rounds, court assignments, and four Player slots per Tournament Match are stored as relational PostgreSQL records with foreign keys tying Match and Player assignments to the correct Round. Staff mutations use authorized Server Actions. Saving setup or regenerating replaces only scheduled Matches; a Schedule with Matches already in play or completed is locked against replacement. The later Match-flow tickets add scoring and lifecycle transitions.
