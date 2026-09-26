# 09: Follow play on the Live Board

**What to build:** As a spectator, I want a current Live Board for all courts that stays fresh during play, so that I can follow Tournament Matches without access to scorer controls.

**Blocked by:** 06 Set up and schedule Open Play; 07 Prototype and deliver the Scoreboard Match flow.

**Status:** ready-for-agent

- [ ] The Live Board shows current, next, and completed Tournament Matches by court using authorized public Event data.
- [ ] Supabase Broadcast sends only minimal change notices; after a notice, the browser refetches current data through Next.js.
- [ ] Automated polling refreshes the Live Board when Broadcast is unavailable or disconnected.
- [ ] Broadcast messages contain no account or private Visitor information.
- [ ] Browser journeys verify timely refresh, polling fallback, connection recovery, responsive layout, and read-only spectator access.
