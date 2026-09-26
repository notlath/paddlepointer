# 13: Keep Qlik analytics working after PHP retirement

**What to build:** As a Qlik data connection and staff user, I want the existing read-only analytics workflows to keep working through Next.js, so that PHP can be retired without changing Qlik's role or feed contract.

**Blocked by:** 03 Sign in with Better Auth and enforce role access; 04 Manage the Current Event; 07 Prototype and deliver the Scoreboard Match flow; 10 Review History and Leaderboards.

**Status:** ready-for-agent

- [ ] Existing Qlik feed paths and response contracts remain compatible for Events, Matches, Players, and derived Rally summaries.
- [ ] Feed routes remain read-only and protected with the existing analytics key contract.
- [ ] Staff token exchange is authorized and Qlik secrets remain server-side.
- [ ] The optional reload trigger retains its supported authorization and response behavior.
- [ ] Staff can open the redesigned Analytics view and inspect the established analytics subjects without Qlik becoming a write path.
- [ ] Contract tests compare representative payloads with current behavior and cover unauthorized access and reload errors.
