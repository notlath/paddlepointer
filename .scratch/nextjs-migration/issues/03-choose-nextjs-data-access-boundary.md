Type: grilling
Status: resolved
Blocked by: 02

Decision: Keep application reads and writes behind the Next.js server. Server Components load initial views directly through a server-only data layer; Server Actions handle UI mutations; Route Handlers serve browser polling, health checks, and external contracts such as Qlik feeds. All three paths use the same domain operations and current Better Auth session, role, and ownership checks. Browsers do not query Supabase application tables directly. Use bounded Drizzle transactions for operations whose records must change together. See [ADR 0009](../../../docs/adr/0009-nextjs-server-owns-data-access.md).

## Question

Where should reads and writes run in the Next.js application: Server Actions, Route Handlers, direct browser-to-Supabase access guarded by Row Level Security, or a deliberate combination? Decide the trusted server boundary, how role checks are enforced, and which operations must remain transactional. Use the settled auth/session model as an input.

## Server boundary

- The server-only data layer owns Drizzle and the PostgreSQL connection. Keep database credentials and Qlik secrets out of client bundles and browser responses. Do not expose application tables through a browser Supabase client or rely on Supabase Auth JWT/RLS to translate Better Auth identities. Restrict database access for browser-facing roles even though application authorization is server-owned.
- Server Components call that data layer directly for initial Event, Tournament, Match, Player, History, and Leaderboard reads. They must check authorization for private data and must not call the app's own Route Handlers as an internal HTTP hop.
- Server Actions are entry points for UI writes, including Event changes, scheduling, Match lifecycle and Rally saves, corrections, Player administration, and account management. An Action can be invoked directly; each invocation validates input, resolves the current Better Auth session, checks the current role and resource ownership, and then calls a domain operation. A prior page check or hidden control is never sufficient.
- Route Handlers expose the HTTP surfaces that need stable URLs or repeated client reads: Live Board and shared-state polling, authorized private refetches, health, Better Auth, and Qlik feed/token/reload contracts. Each protected handler performs the same checks as an Action. Explicitly public reads return only public Event data; Visitor history and account data are always scoped to the verified account. Keep Qlik token and feed checks distinct from browser sessions where their external contract requires it.
- Shared domain operations perform the final permission and ownership checks before reading or writing. Refresh role and active status from server data at request time, including after staff changes. Treat public Broadcast messages as invalidation only: after receiving one, the browser refetches through an authorized Route Handler.

## Atomic operations

Use a bounded Drizzle transaction for any mutation where a partial commit would break the domain state. At minimum this covers saving or correcting a Match with its Rally log, score, participants, and Tournament Match link; starting, updating, resetting, or deleting an Event or Tournament with its Schedule and Match records; merging or renaming a Player across references and account links; and account role/active changes with session revocation. Lock or conditionally update contested rows when concurrent scorers or staff can modify the same Match or Schedule. Check authorization before the transaction and recheck mutable ownership/state inside it when a race could change the outcome. Do not hold a transaction open across email delivery, Qlik calls, or other network work; trigger those effects after commit through a retryable mechanism.

## Delivery checks

- Browser tests prove that public, staff, scorer, Player, and Visitor entry points return only permitted data and that direct Action/Route Handler calls cannot bypass role or ownership checks.
- Integration tests exercise concurrent or failed multi-record mutations and show all-or-nothing state, including Match completion, Schedule changes, Player Merge, and account deactivation.
- A build check confirms the database connection and privileged secrets stay in server code; a network check confirms browser traffic reaches application routes rather than Supabase application tables.

Sources: [Next.js data security](https://nextjs.org/docs/app/guides/data-security), [Next.js backend for frontend](https://nextjs.org/docs/app/guides/backend-for-frontend), [Drizzle transactions](https://orm.drizzle.team/docs/transactions), [Supabase secure data](https://supabase.com/docs/guides/database/secure-data).
