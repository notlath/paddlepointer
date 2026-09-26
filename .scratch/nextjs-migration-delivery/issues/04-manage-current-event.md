# 04: Manage the Current Event

**What to build:** As a Super Admin, I want to start and inspect Events and choose the Current Event, so that live operations use the intended Event while past Event history remains available.

**Blocked by:** 01 Deploy the Next.js foundation; 03 Sign in with Better Auth and enforce role access.

**Status:** implemented; local database browser verification pending

- [x] A Super Admin can start a new Event and make it Current Event without deleting or rewriting past Events.
- [x] Starting a new Event cannot be undone by selecting a past Event as current.
- [x] Authorized staff can see the Current Event and inspect the list and details of past Events.
- [x] Event reads and state changes persist in PostgreSQL and respect server-side role permissions.
- [x] Browser journeys cover starting an Event, viewing past Events, and attempts by unauthorized roles to change the Current Event.

The browser journey is implemented but could not execute locally because this workspace has no disposable PostgreSQL configuration. Run it after applying migration 0002 to a disposable database.
