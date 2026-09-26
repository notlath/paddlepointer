# 04: Manage the Current Event

**What to build:** As a Super Admin, I want to start and inspect Events and choose the Current Event, so that live operations use the intended Event while past Event history remains available.

**Blocked by:** 01 Deploy the Next.js foundation; 03 Sign in with Better Auth and enforce role access.

**Status:** ready-for-agent

- [ ] A Super Admin can start a new Event and make it Current Event without deleting or rewriting past Events.
- [ ] Starting a new Event cannot be undone by selecting a past Event as current.
- [ ] Authorized staff can see the Current Event and inspect the list and details of past Events.
- [ ] Event reads and state changes persist in PostgreSQL and respect server-side role permissions.
- [ ] Browser journeys cover starting an Event, viewing past Events, and attempts by unauthorized roles to change the Current Event.
