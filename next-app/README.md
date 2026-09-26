# PaddlePointer Next.js foundation

This app is an isolated migration preview. The current PHP application remains at the repository root.

## Local development

Use Bun. Run `bun install --frozen-lockfile`, copy `.env.example` to `.env.local`, set the database URLs, then run `bun run dev`. Open `http://localhost:3000`. The shell renders without a database; `GET /api/health` returns HTTP 200 with `{ "status": "ok", "database": "connected" }` only after a `select 1` through Drizzle succeeds. It returns HTTP 503 with `unconfigured` or `degraded` otherwise. The response never includes credentials or the underlying error.

`DATABASE_URL` is the Supabase transaction pooler URI for the running app. The Postgres.js client uses one connection and disables prepared statements for transaction pooling. `DIRECT_DATABASE_URL` is a direct or session pooler URI used only by Drizzle Kit migration commands. Never use a production URI for local development.

## Environments and deployment

The isolated Vercel project is `lathrells-projects/paddlepointer-next-preview`, connected to this repository with **Root Directory** set to `next-app` and **Framework Preset** set to Next.js. Its first [Preview deployment](https://paddlepointer-next-preview-h3y7n9vk4-lathrells-projects.vercel.app) uses the disposable Supabase project `paddlepointer-next-preview` (`xrkgxbqwvikvkgclwgau`). `DATABASE_URL` and `DIRECT_DATABASE_URL` are sensitive Vercel Preview variables; do not prefix either with `NEXT_PUBLIC_`. Configure separate Supabase databases and environment variable values:

| Environment | Vercel scope | Database |
| --- | --- | --- |
| Development | local `.env.local` or Vercel Development | disposable development project |
| Preview | Preview, optionally branch-scoped | disposable preview project |
| Staging | Vercel custom staging environment | staging project |
| Production | Production | production project |

Later authentication, email, and Qlik secrets must follow the same boundaries and stay in server-side Vercel variables. Do not reuse preview credentials in production. Do not expose any database URL in browser code or commit `.env.local`.

Run `SMOKE_BASE_URL=https://<preview-url> bun run test:smoke` against a Preview deployment. This checks the rendered shell in a browser and requires the health endpoint to report a working database. Vercel SSO protects this project's previews. For an automated check, set `VERCEL_AUTOMATION_BYPASS_SECRET` in the test process to the project's automation bypass secret; Playwright sends it only in request headers. Keep that secret outside the repository. The same command without `SMOKE_BASE_URL` starts a local server; local health may be unconfigured. Install the Playwright browser first with `bunx playwright install chromium`.

## Database migrations

Domain tables are intentionally deferred to later tickets. `src/server/schema.ts` is the Drizzle schema entry point. For each schema change, update that file, run `bun run db:generate`, review and commit the generated SQL in `drizzle/`, then run `bun run db:migrate` against a disposable development database. Apply the same committed migrations to preview and staging before their deployments. Promote those migrations to production as a separate release step before deploying code that needs them. Set `DIRECT_DATABASE_URL` in the shell that runs `db:migrate`; it is not required by the app at runtime. Do not run `drizzle-kit push` against shared environments.
