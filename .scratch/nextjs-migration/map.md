## Destination

A buildable implementation spec for redesigning and migrating PaddlePointer's HTML/CSS/JS and PHP application to Next.js, Supabase managed PostgreSQL, and Vercel, while retaining Qlik analytics and the established domain operations. It will define a staged migration and cutover from a separate branch.

## Notes

- Confirmed scope: redesign all role surfaces and replace the application UI and PHP API; keep Qlik Cloud analytics.
- Confirmed target: Supabase managed PostgreSQL, Drizzle, and Vercel.
- Confirmed hosting: Vercel.
- Confirmed migration approach: staged, developed on a separate branch to avoid collisions with `dev`.
- Better Auth owns credentials and sessions, stored in Supabase PostgreSQL through Drizzle. Staff keep username/password sign-in and must have a reachable email. Visitors verify email ownership with an OTP code. Inventory Player accounts before deciding how username-only access transitions.
- All protected application database access runs through Next.js server code using Better Auth checks and Drizzle. Use Server Components for initial reads, Server Actions for UI mutations, and Route Handlers for polling and external contracts.
- New PostgreSQL tables use domain names. Relational records are authoritative for stable entities and relationships; JSONB holds the ordered Rally log and genuinely variable payloads.
- Keep Qlik's existing feed paths and data contract while moving its app-owned PHP endpoints to Next.js. Qlik remains the read-only analytics layer.
- Supabase Broadcast sends minimal notices for public shared Event data; browsers refetch through Next.js and have automated polling as fallback. Account and Visitor-private data do not go over a public channel.
- Redesign all role surfaces while retaining PaddlePointer's brand identity and established scoring, scheduling, permissions, and operational actions. Prototype the Scoreboard first.
- Cut over between Events with a brief write freeze and final data sync, without dual writes. Keep the old MySQL database read-only; after Supabase accepts its first production write, recover by fixing forward.
- This map resolves decisions only. Implementation starts after its decisions are settled and handed off to `/to-spec`.

## Decisions so far

- Use Drizzle ORM for Supabase PostgreSQL. Keep the TypeScript schema and reviewed SQL migrations in source control; apply migrations with a controlled deployment step, and use bounded transactions for operations with multi-record invariants. See [ADR 0013](../../docs/adr/0013-drizzle-and-reviewed-sql-migrations.md).
- Better Auth owns credentials and sessions; PaddlePointer owns roles, permissions, and Player links. See [ticket 02](issues/02-preserve-auth-and-session-model.md) and [ADR 0007](../../docs/adr/0007-better-auth-for-nextjs-migration.md) for the role and session contract.
- Next.js owns application data access: Server Components read initial views, Server Actions perform UI writes, and Route Handlers serve polling and external contracts. Shared server operations enforce role and ownership checks and use transactions for multi-record invariants. See [ticket 03](issues/03-choose-nextjs-data-access-boundary.md) and [ADR 0009](../../docs/adr/0009-nextjs-server-owns-data-access.md).
- PostgreSQL uses relational domain records for Events, Tournaments, Schedules, Matches, Players, and account links; only the ordered Rally log and genuinely variable payloads remain JSONB. See [ticket 04](issues/04-choose-postgres-data-model.md) and [ADR 0010](../../docs/adr/0010-postgres-domain-schema-with-jsonb-rally-log.md).
- Public Event changes send minimal Supabase Broadcast invalidations; clients refetch through Next.js, with a 10-second safety poll and 2-second disconnected Live Board polling. See [ticket 05](issues/05-decide-live-board-update-transport.md) and [ADR 0011](../../docs/adr/0011-broadcast-as-invalidation-only.md).
- Qlik keeps its four read-only REST feed URLs and staff-only token exchange on Next.js. Optional pending reloads drain through a protected one-minute Vercel Cron on Pro/Enterprise; Qlik's scheduled reload remains the backstop. See [ticket 06](issues/06-preserve-qlik-integration-on-vercel.md) and [ADR 0014](../../docs/adr/0014-keep-qlik-rest-feeds-on-vercel.md).
- Stage an idempotent, source-ID-mapped data copy while MySQL remains the production writer. Reconcile every source record and Qlik feed before an Event-boundary freeze, final sync, and traffic switch; after Supabase's first production write, recover forward there. See [ticket 07](issues/07-plan-data-copy-and-staged-cutover.md).
- Port the application as role-specific Next.js routes with server-loaded data and focused client interaction components. Prototype the Scoreboard first, preserve URL navigation and active Match recovery, and translate the existing behavior modules without retaining the monolithic browser runtime. See [ticket 08](issues/08-choose-ui-porting-shape.md).

## Not yet specified

- Exact column definitions, deletion policies, migration scripts, and measured freeze timing for the production data copy.
- Player account inventory and the account-upgrade path; the staff email collection workflow and password-hash migration details.
- Scoreboard prototype feedback and final visual details across device sizes.
- Email-delivery provider and production Qlik/Vercel environment verification.
- Vercel/Supabase development, preview, staging, and production environment setup.
- Detailed release acceptance criteria, operational runbook, and the final cutover checklist.

## Out of scope

- Replacing Qlik Cloud or its analytics experience.
- Changing scoring rules, schedule-generation behavior, permissions, or established operational actions as part of the redesign.
- Marketing consent, Lead collection, or Lead export.
