# 13: Keep Qlik analytics working after PHP retirement

**What to build:** As a Qlik data connection and staff user, I want the existing read-only analytics workflows to keep working through Next.js, so that PHP can be retired without changing Qlik's role or feed contract.

**Blocked by:** 03 Sign in with Better Auth and enforce role access; 04 Manage the Current Event; 07 Prototype and deliver the Scoreboard Match flow; 10 Review History and Leaderboards.

**Status:** implemented; local database and Qlik tenant verification pending

- [x] Existing Qlik feed paths and response contracts remain compatible for Events, Matches, Players, and derived Rally summaries.
- [x] Feed routes remain read-only and protected with the existing analytics key contract.
- [x] Staff token exchange is authorized and Qlik secrets remain server-side.
- [x] The optional reload trigger retains its supported authorization and response behavior.
- [x] Staff can open the redesigned Analytics view and inspect the established analytics subjects without Qlik becoming a write path.
- [x] Contract tests compare representative payloads with current behavior and cover unauthorized access and reload errors.

The Next.js feed contract journey needs a disposable local PostgreSQL database with migration 0010 and `ANALYTICS_KEY` set. The Qlik mashup and token exchange also require tenant credentials for live verification. The optional reload command must be scheduled by the deployment operator; the periodic Qlik reload remains its backstop.
