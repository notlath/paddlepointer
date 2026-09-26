Type: grilling
Status: resolved

Decision: Use Drizzle ORM with Supabase PostgreSQL. Keep the TypeScript schema and reviewed, versioned SQL migrations in source control; generate migrations with `drizzle-kit generate` and apply them with `drizzle-kit migrate`. Reserve `drizzle-kit push` for disposable local databases. Use bounded Drizzle transactions for application invariants that span writes, and apply migrations as a controlled deployment step before traffic reaches the changed schema. See [ADR 0013](../../../docs/adr/0013-drizzle-and-reviewed-sql-migrations.md).

## Question

Should the Next.js application use Prisma or Drizzle to access Supabase PostgreSQL? Compare the fit with the current relational schema and JSON-backed tournament/match data, migration tooling, type safety, transaction needs, and Vercel deployment. Decide on one ORM and the migration conventions the team will use.
