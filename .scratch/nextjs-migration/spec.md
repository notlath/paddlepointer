# PaddlePointer Next.js Migration

Status: ready-for-agent

## Problem Statement

PaddlePointer currently runs as a plain HTML, CSS, and JavaScript application backed by PHP endpoints and MySQL/MariaDB. Its role-based scoring, Tournament operations, Player records, Visitor portal, and staff views depend on that stack. The system must move to a maintainable Next.js platform without losing operational behavior, score history, permissions, or Qlik analytics. The migration also needs a clear production cutover that avoids conflicting writes and protects match data.

## Solution

Build a redesigned Next.js application backed by Supabase managed PostgreSQL and Drizzle, deployed to Vercel. Replace the PHP API and existing application UI, while retaining Qlik Cloud as the read-only analytics platform and preserving its feed contract. Migrate in stages on a separate branch. Use Better Auth for accounts and sessions, keep protected data access on the Next.js server, and keep normalized PostgreSQL domain records authoritative with JSONB for ordered Rally logs and genuinely variable data.

The migration preserves PaddlePointer's established Match scoring, Tournament scheduling, permissions, and operational actions while redesigning every role surface. A Scoreboard prototype is the first UI milestone. Production cutover happens between Events after a short write freeze and final sync; MySQL remains read-only afterward and any post-cutover recovery is fix-forward.

## User Stories

1. As a Super Admin, I want to sign in with my username and password, so that I can continue managing PaddlePointer with a familiar staff credential.
2. As a staff member, I want my account to have a reachable verified email, so that verification and account recovery can reach me.
3. As a staff member, I want my role's permissions enforced for every protected operation, so that hiding a control in the UI is never the only access check.
4. As a Super Admin, I want to manage staff accounts and roles, so that access matches staff responsibilities.
5. As a Visitor, I want to verify my email with a one-time code before accessing my Visitor account, so that another person cannot use my email to view my Match history.
6. As a Visitor, I want to score my own Matches and review their history and Leaderboard, so that I can use the self-service portal without seeing another Visitor's data.
7. As a Player, I want to view my own Match summaries when the account migration path is defined, so that my account remains separate from my Player identity and Match records.
8. As a staff member, I want to start a new Event without deleting past Events, so that the new Current Event has a fresh operational context while historical results remain available.
9. As a Super Admin, I want to choose and inspect the Current Event, so that scorers and shared views use the intended Event.
10. As an Admin, I want to create and configure a Tournament, so that an Open Play event can be prepared for its Players and courts.
11. As an Admin, I want to generate and manage a Schedule of Rounds and courts, so that Players receive playable Tournament Matches.
12. As an Admin, I want to see scheduling conflicts and unavailable Players before committing a Schedule, so that a Tournament can be corrected before play begins.
13. As an Admin, I want to start, reset, correct, or remove Tournament Matches according to my permission, so that staff can handle operational changes and mistakes safely.
14. As a scorer, I want to start, resume, and end a Match, so that play is recorded from its start through its saved result.
15. As a scorer, I want to record each Rally with the correct serving side, serve position, point, side-out, or other scoring outcome, so that the Match Score and Rally history remain accurate.
16. As a scorer, I want to undo or correct a scoring action, so that an accidental input does not corrupt the Match result.
17. As a scorer, I want active Match state to survive ordinary navigation or refresh, so that an in-progress Match can be recovered without losing its scoring context.
18. As a scorer, I want clear feedback when a Match is saving, saved, or unable to save, so that I know whether the result is durable.
19. As a spectator, I want a Live Board showing current, next, and completed Tournament Matches across courts, so that I can follow play without accessing scorer controls.
20. As a spectator, I want the Live Board to update promptly when shared Event data changes, so that I see current court and Match status.
21. As a spectator, I want the Live Board to recover when a realtime connection is interrupted, so that polling keeps the view fresh.
22. As a staff member, I want to manage persistent Player records and skill levels, so that identity and Open Play balancing carry across Events.
23. As a staff member, I want to rename or merge duplicate Players, so that historical Matches and linked account relationships resolve to the surviving Player.
24. As a staff member, I want to view History and Leaderboards for the Current Event or All Events, so that results remain understandable across Event boundaries.
25. As a staff member, I want Visitor results kept outside Event Leaderboards, so that Visitor Matches do not affect MTC Player standings.
26. As a staff member, I want an Analytics view for the established analytics subjects, so that I can inspect Qlik-backed results from within PaddlePointer.
27. As a Qlik data connection, I want compatible read-only feed paths and data contracts, so that analytics can continue to load Events, Matches, Players, and rally summaries after PHP is retired.
28. As a Qlik data connection, I want the existing protected token exchange and optional reload trigger to remain available through server-side Next.js routes, so that credentials stay server-side and Qlik can continue its established workflow.
29. As a Super Admin, I want the migration to preserve every Event, Tournament Match, finished Match, Rally, Player, account relationship, and relevant application setting, so that operational and analytics history remains intact.
30. As an operator, I want migration validation to compare record counts, references, scores, and derived Qlik feed results, so that data discrepancies are found before production cutover.
31. As an operator, I want a short write freeze and final sync between Events, so that the production switch does not lose or duplicate live Match writes.
32. As an operator, I want the old MySQL database retained read-only after cutover, so that historical inspection is possible without creating a second source of truth.
33. As an operator, I want a fix-forward recovery plan after Supabase accepts its first production write, so that recovery does not silently overwrite newer data with stale MySQL state.
34. As an operator, I want separate development, preview, staging, and production configuration, so that deployments use the correct Supabase database, authentication settings, email provider, and Qlik secrets.
35. As a staff member using a phone or desktop, I want redesigned role-specific surfaces that retain PaddlePointer's brand and clear operational hierarchy, so that the migrated app remains usable during live play.

## Implementation Decisions

- Replace the existing HTML/CSS/JavaScript application and PHP API with a Next.js application. Retain Qlik Cloud and its analytics role.
- Use Supabase managed PostgreSQL, Drizzle ORM, and Vercel. Develop the migration on a separate branch so it does not collide with the existing `dev` branch.
- Use Better Auth for credentials and sessions, with its tables in Supabase PostgreSQL through Drizzle. Staff retain username/password sign-in and require a reachable email for verification and recovery. Visitors verify email ownership by one-time code. Inventory Player accounts before deciding how existing username-only Player access transitions.
- Keep browser access to protected application data behind the Next.js server. Use Server Components for initial reads, Server Actions for UI mutations, and Route Handlers for polling and external contracts. Do not allow direct browser queries to application tables. Enforce Better Auth and role/ownership checks in server code.
- Treat Events, Tournament Matches, Matches, Players, and stable relationships as normalized relational records with canonical domain names. Use JSONB for ordered Rally logs and genuinely variable payloads, not a duplicate full Match or Tournament record. Preserve legacy shapes only where needed at migration or compatibility boundaries.
- Use Supabase Broadcast only for minimal invalidation notices about public shared Event data. After a notice, clients refetch authorized data through Next.js. Add automated polling as a fallback. Never broadcast account or private Visitor data.
- Keep Qlik read-only. Preserve current Qlik feed paths and contracts where possible, and move app-owned feed, token, and optional reload-trigger behavior from PHP into protected Next.js Route Handlers. Keep analytics credentials and keys server-side.
- Redesign staff/admin, scorer, Live Board, Player/Visitor, History/Leaderboard, and analytics-shell surfaces. Retain the brand identity and established scoring, scheduling, permissions, and operational actions. Prototype the Scoreboard first and use its feedback to guide the remaining role surfaces.
- Cut production over between Events. Freeze writes briefly, perform a final sync, validate the migrated state, then direct production use to Next.js/Supabase. Do not dual-write. Keep MySQL read-only. Once Supabase receives its first production write, recovery is fix-forward rather than reverse synchronization.
- Resolve the production data model, migration scripts, validation thresholds, environment setup, mail provider, Broadcast trigger coverage and poll interval, Qlik reload scheduling, Player account transition, and operational runbook as explicit implementation decisions before the relevant work ships.

## Testing Decisions

- Prefer tests of externally observable behavior: what a role can see and do, what data is saved and returned, what Qlik receives, and what happens across refresh, reconnect, and migration boundaries. Avoid tests coupled to component internals or private helper structure.
- Use browser-level journeys through the Next.js application as the primary seam. Cover authentication and role boundaries, Tournament setup and scheduling, Match lifecycle and Rally scoring, corrections, Player administration, History and Leaderboards, Visitor privacy, responsive Scoreboard behavior, Live Board freshness and fallback, and staff analytics access.
- Add focused contract tests at the system boundaries for Better Auth email verification and recovery, Qlik feed compatibility/token/reload behavior, and data migration validation. Verify that public Broadcast notices contain only invalidation information and that refetches still enforce authorization.
- Exercise domain-level Match scoring and Schedule generation through their existing public behavior/contracts where feasible, keeping the number of test seams small and preferring end-to-end coverage for integrated flows.
- Existing prior art includes browser tests for Match lifecycle, Rally scoring, Tournament Match behavior, Open Play scheduling, role access, sign-in, shared data refresh, Live Board behavior, responsive Scoreboard, History actions, and Qlik UI; PHP tests cover permissions, accounts, Match/Tournament persistence, Player operations, analytics feeds, token access, and reload triggering. Carry these behaviors into the new stack rather than preserving tests that assert implementation details of PHP or the current DOM structure.
- Migration tests must use representative source data and verify counts, foreign-key relationships, score/event-log integrity, Player identity links, Visitor isolation, and compatibility of resulting Qlik feed payloads. Include a repeatable rehearsal before production cutover.
- Run the complete repository test suites for the implementation before committing, including the browser suite and database-backed API/integration coverage appropriate to the new stack. This spec-writing task does not run tests.

## Out of Scope

- Replacing Qlik Cloud or changing its role as the read-only analytics platform.
- Changing Match scoring rules, Open Play scheduling behavior, permissions, or established operational actions as part of the redesign.
- Adding marketing consent, Lead collection, or Lead export to Visitor verification.
- Deciding or implementing a Player-account upgrade path before the account inventory is complete.
- Reversing a completed Event or synchronizing production writes back to MySQL after cutover.

## Further Notes

- The accepted architecture decisions are recorded in ADRs for Better Auth, Visitor email verification, server-owned data access, relational schema with JSONB Rally logs, Broadcast invalidation, and Event-boundary cutover.
- The migration map contains the detailed planning frontier. Before production readiness, finish account inventory and staff email readiness, specify the schema and migration validation, confirm Scoreboard prototype feedback, and document deployment and cutover operations.
- Keep Qlik's existing Event history and analytics-copy semantics: all eligible historical results remain available, and analytics continues to use its read-only copy rather than becoming a write path.
- Preserve the canonical domain vocabulary: Match, Tournament, Open Play, Schedule, Round, Tournament Match, Live Board, Scoreboard, Event, Current Event, Rally, Player, Visitor, and Leaderboard.
