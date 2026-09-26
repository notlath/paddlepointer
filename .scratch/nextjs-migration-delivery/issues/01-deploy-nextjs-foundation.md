# 01: Deploy the Next.js foundation

**What to build:** As an operator, I want a working Next.js application deployed to a Vercel preview and connected to Supabase PostgreSQL, so that the migration has a safe, verifiable home separate from the current production application.

**Blocked by:** None (can start immediately).

**Status:** done

- [x] A minimal application shell deploys successfully to a Vercel preview environment.
- [x] The server can connect to Supabase PostgreSQL through Drizzle and report a useful health state without exposing credentials.
- [x] Development, preview, staging, and production configuration boundaries are documented, with secrets kept server-side.
- [x] The application has a documented database migration workflow suitable for local development and deployment.
- [x] A browser-level smoke check verifies the deployed shell and database health path.
