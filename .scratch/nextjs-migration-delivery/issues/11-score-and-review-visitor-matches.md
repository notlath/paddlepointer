# 11: Score and review private Visitor Matches

**What to build:** As a Visitor, I want to verify my email, score my own Matches outside Events, and review my own results, so that I can use the self-service portal without exposing my history to another Visitor.

**Blocked by:** 03 Sign in with Better Auth and enforce role access; 07 Prototype and deliver the Scoreboard Match flow; 10 Review History and Leaderboards.

**Status:** implemented; local database browser verification pending

- [x] A Visitor can complete one-time-code email verification and access only the account associated with that verified email.
- [x] A Visitor can score and save Matches that belong to no Event and whose names do not create Player records.
- [x] A Visitor can review only their own Match History and Visitor Leaderboard.
- [x] Visitor Matches do not appear in MTC Event Leaderboards or other Visitors' views.
- [x] Browser and email contract journeys cover verification, scoring, privacy isolation, expired codes, and recovery from delivery or network errors.

The browser journey requires a disposable local PostgreSQL database with migration 0009 applied and an auth test outbox. It is implemented but cannot execute in a workspace without those prerequisites.
