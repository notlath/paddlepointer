---
status: accepted
---

# Keep application data access behind the Next.js server

The Next.js server will authorize application operations with Better Auth and access Supabase PostgreSQL through Drizzle; browsers will not query application tables directly. This preserves the current server-enforced permission boundary and avoids a custom bridge between Better Auth sessions and Supabase Auth JWT-based RLS. The tradeoff is that the Next.js server must enforce every user-level permission consistently, and database credentials must remain server-side.

## Consequences

- Server Components read initial data directly through a server-only data layer. Server Actions handle UI mutations, and Route Handlers serve polling, health, Better Auth, and external contracts such as Qlik. Protected entry points verify the current session, role, and resource ownership on every request; public reads return only explicitly public Event data. Reuse domain operations rather than making Server Components call internal HTTP routes.
- Multi-record Match, Tournament, Event, Player, and account changes run in bounded Drizzle transactions. Recheck state under a lock or conditional update when concurrent writes can race. External email and Qlik calls run after commit through a retryable path, never inside the database transaction.
- Privileged PostgreSQL credentials stay server-side. Browser-facing database roles have no direct access to application tables. Supabase Broadcast may announce public invalidation, but browsers refetch through authorized Next.js routes.
