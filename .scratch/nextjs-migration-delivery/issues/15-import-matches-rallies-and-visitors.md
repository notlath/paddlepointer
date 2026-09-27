# 15: Import Matches, Rally logs, and Visitor history

**What to build:** As a migration operator, I want to import historical Match results and Visitor-owned history, so that scoring records remain complete and correctly separated after moving to PostgreSQL.

**Blocked by:** 03 Sign in with Better Auth and enforce role access; 07 Prototype and deliver the Scoreboard Match flow; 11 Score and review private Visitor Matches; 14 Import Events, Schedules, and Players.

**Status:** implemented; fixture integration verified on disposable Neon PostgreSQL; no populated legacy MySQL source exists

- [x] A repeatable import handles legacy finished and in-progress Match records, ordered Rally logs, Team membership, scores, status, and Event/Tournament Match relationships.
- [x] Visitor Matches remain outside Events and are associated only with the appropriate Visitor identity after verification and safe mapping.
- [x] The import reports source counts, imported counts, rejected records, and score, identity, or relationship discrepancies.
- [x] Imported Matches and Rally histories can be inspected through authorized Next.js views, with no duplicate full-record JSON becoming authoritative.
- [x] Integration coverage verifies Rally order, score state, Visitor isolation, Player references, and consistency on repeated rehearsal.
