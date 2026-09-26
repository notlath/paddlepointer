# 14: Import Events, Schedules, and Players

**What to build:** As a migration operator, I want to import legacy Events, Tournament Schedules, and Player identities into PostgreSQL, so that staff can inspect the existing event structure and roster in the new application before cutover.

**Blocked by:** 04 Manage the Current Event; 05 Manage the Player directory; 06 Set up and schedule Open Play.

**Status:** ready-for-agent

- [ ] A repeatable import handles representative legacy Event, Tournament, Round, court, Tournament Match, Player, and skill-level data.
- [ ] Stable relationships are preserved in the relational schema; legacy JSON is transformed into the agreed canonical model where applicable.
- [ ] The import reports source counts, imported counts, rejected records, and relationship discrepancies without silently dropping data.
- [ ] Imported records are visible in the Next.js Event and Player views and do not overwrite unrelated target data on a repeat rehearsal.
- [ ] Integration coverage verifies identity, schedule, and foreign-key integrity using representative source fixtures.
