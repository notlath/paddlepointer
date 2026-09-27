# 17: Cut over between Events and retire the PHP API

**What to build:** As an operator, I want to move production to Next.js and Supabase between Events, so that users work from one authoritative system and the old PHP API can be retired without losing writes or analytics.

**Blocked by:** 08 Correct Tournament Match operations; 09 Follow play on the Live Board; 10 Review History and Leaderboards; 11 Score and review private Visitor Matches; 12 Restore Player account summaries; 13 Keep Qlik analytics working after PHP retirement; 16 Rehearse full migration and verify Qlik parity.

**Status:** implementation prepared; production cutover pending named owner approval, production access, and between-Events window

- [x] The cutover runbook defines readiness checks, owner actions, communications, freeze timing, final synchronization, validation, and go/no-go criteria.
- [ ] Production writes are frozen briefly, the final MySQL-to-Supabase sync is performed, and reconciliation passes before traffic moves.
- [ ] Production application traffic moves to Next.js/Supabase without dual writes; Qlik feed and staff analytics workflows continue to work.
- [ ] The old MySQL database is retained read-only and PHP endpoints are retired only after equivalent application and Qlik contracts are verified.
- [x] The runbook states that after the first production write to Supabase, recovery is fix-forward and does not reverse-sync into MySQL.
- [ ] Post-cutover browser journeys cover staff, scorer, Visitor, Player, spectator, and Qlik-facing operations. The runbook lists the journeys; execution awaits the live switch.

Implementation evidence: `docs/migration/cutover-runbook.md` describes the operator sequence, `PP_WRITE_FREEZE` gates both applications, and `--verify-only` reconciles a frozen snapshot against a read-only PostgreSQL connection. The disposable Neon fixture passed 31 read-only checks with no failures and one expected Current Event review item. No production traffic, Qlik connection, MySQL permissions, or PHP deployment has been changed.

Connected-service evidence: [cutover readiness check](../../../docs/migration/cutover-readiness-2026-09-27.md). On 2026-09-28 the operator designated the visible Supabase project as the cutover target and approved the project's `vercel.app` URL. The database now has migrations 0000–0011, empty application tables, and RLS enabled on all public tables. Local health, Live Board, and four keyed Qlik feeds pass against it. Vercel access works via direct project lookup; the old preview deployment and remaining email and Qlik configuration block the live switch.
Production Vercel configuration now includes the designated database URLs, auth secret and URL, analytics key, Supabase browser URL/key, and `PP_WRITE_FREEZE=1`. Email and Qlik service configuration, a current deployment, public access, a between-Events window, and the live operational checks remain pending.
