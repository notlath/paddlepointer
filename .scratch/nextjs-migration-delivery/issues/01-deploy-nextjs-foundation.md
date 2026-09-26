# 01: Deploy the Next.js foundation

**What to build:** As an operator, I want a working Next.js application deployed to a Vercel preview and connected to Supabase PostgreSQL, so that the migration has a safe, verifiable home separate from the current production application.

**Blocked by:** None (can start immediately).

**Status:** ready-for-agent

- [ ] A minimal application shell deploys successfully to a Vercel preview environment.
- [ ] The server can connect to Supabase PostgreSQL through Drizzle and report a useful health state without exposing credentials.
- [ ] Development, preview, staging, and production configuration boundaries are documented, with secrets kept server-side.
- [ ] The application has a documented database migration workflow suitable for local development and deployment.
- [ ] A browser-level smoke check verifies the deployed shell and database health path.
