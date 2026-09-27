# PaddlePointer Next.js foundation

This app is an isolated migration preview. The current PHP application remains at the repository root.

## Local development

Use Bun. Run `bun install --frozen-lockfile`, copy `.env.example` to `.env.local`, set the database URLs, then run `bun run dev`. Open `http://localhost:3000`. The shell renders without a database; `GET /api/health` returns HTTP 200 with `{ "status": "ok", "database": "connected" }` only after a `select 1` through Drizzle succeeds. It returns HTTP 503 with `unconfigured` or `degraded` otherwise. The response never includes credentials or the underlying error.

`DATABASE_URL` is the Supabase transaction pooler URI for the running app. The Postgres.js client uses one connection and disables prepared statements for transaction pooling. `DIRECT_DATABASE_URL` is a direct or session pooler URI used only by Drizzle Kit migration commands. Never use a production URI for local development.

## Environments and deployment

The isolated Vercel project is `lathrells-projects/paddlepointer-next-preview`, connected to this repository with **Root Directory** set to `next-app` and **Framework Preset** set to Next.js. Deploy with `bunx vercel deploy --yes --scope lathrells-projects` from the repository root so Vercel receives the `next-app` directory. Its first [Preview deployment](https://paddlepointer-next-preview-h3y7n9vk4-lathrells-projects.vercel.app) uses the disposable Supabase project `paddlepointer-next-preview` (`xrkgxbqwvikvkgclwgau`). `DATABASE_URL` and `DIRECT_DATABASE_URL` are sensitive Vercel Preview variables; do not prefix either with `NEXT_PUBLIC_`. Configure separate Supabase databases and environment variable values:

| Environment | Vercel scope | Database |
| --- | --- | --- |
| Development | local `.env.local` or Vercel Development | disposable development project |
| Preview | Preview, optionally branch-scoped | disposable preview project |
| Staging | Vercel custom staging environment | staging project |
| Production | Production | production project |

Authentication and email secrets follow the same boundaries and stay in server-side Vercel variables. Do not reuse preview credentials in production. Do not expose any database URL in browser code or commit `.env.local`.

## Authentication setup

Ticket 03 adds Better Auth tables and Resend delivery. Apply the committed migrations with `bun run db:migrate` to a disposable database before trying sign-in. To configure a verified sender and local email variables, run `bash scripts/setup-auth-email.sh`; the wizard also walks through the manual Vercel Preview variables. Live email remains unavailable until the Resend domain is verified and `RESEND_API_KEY` and `AUTH_EMAIL_FROM` are set. The auth API returns HTTP 503 without `BETTER_AUTH_SECRET`. Vercel Preview uses its `VERCEL_URL` as the auth origin; set `BETTER_AUTH_URL` only when using a stable custom origin.

The [ticket 03 Preview deployment](https://paddlepointer-next-preview-9kyxygpm3-lathrells-projects.vercel.app) has a connected database and the auth secret. Email sign-in remains gated by the two Resend variables; provision the sender and redeploy before validating real delivery.

## Live Board updates

`/live-board` and `/api/live-board` are public and expose only the Current Event, court assignments, Player names, Match status, Scores, and winner. Set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` for browser Broadcast subscriptions. Database triggers advance one Event revision per transaction and publish only Event ID and revision on a public `event:<id>` topic; a separate `live-board` notice marks Current Event switches. The browser refetches `/api/live-board` after a newer notice, on reconnect, and when a hidden tab becomes visible. It polls every two seconds while visible and disconnected and every ten seconds while visible and connected. Local PostgreSQL without Supabase Realtime still advances revisions and uses polling.

The first staff account is controlled by `bun run bootstrap:super-admin` in an interactive terminal with `DATABASE_URL` set. It prompts for a new password without echoing it and creates `@lathrellpagsuguiron` at `lathrell.pagsuguiron@mtc.com.ph` as **unverified**. Once email delivery is configured, use `/recover` to send its verification link, then sign in at `/sign-in`. Re-running bootstrap will not replace the account. Visitors use a five-minute email code; staff and provisioned Players use a username and password. Protected account reads and name changes go through `/api/accounts/{id}` with server-side ownership checks; `/api/staff` checks the current staff role. The auth tables have RLS enabled without browser-facing policies; the server connects through PostgreSQL. A database trigger revokes sessions on role change or deactivation, and deleting a user cascades to sessions. Better Auth revokes sessions after password reset.

For new Player accounts, review the Player's identity and exact Player ID outside the application, then run `bun run provision:player -- <reviewed-player-id> <reachable-email> <username>` interactively. The script uses the explicit ID, creates a Player-role account with a new password, and leaves the email unverified. The Player uses `/recover` to verify the email before username/password sign-in; `/player` then reads only the linked Player ID. The empty-source inventory in `docs/migration/legacy-account-inventory.md` contains no legacy accounts to migrate. If real legacy accounts appear before cutover, reopen that inventory and review each link rather than matching names.

If a verified Player account is unlinked, staff should review both the account ID and Player ID with the person, then run `bun run link:player -- <reviewed-account-id> <reviewed-player-id>`. The command refuses unverified accounts, non-Player accounts, and Player records already linked elsewhere. Neither command searches by name to infer identity.

For local browser auth tests, use a disposable PostgreSQL database with migrations applied, set `DATABASE_URL` to its `127.0.0.1` URL and `AUTH_TEST_OUTBOX_DIR` to a temporary directory, then run `bunx playwright test tests/auth.spec.ts`. The outbox works only outside production and writes code messages to local files; it never sends email.

Run `SMOKE_BASE_URL=https://<preview-url> bun run test:smoke` against a Preview deployment. This checks the rendered shell in a browser and requires the health endpoint to report a working database. Vercel SSO protects this project's previews. For an automated check, set `VERCEL_AUTOMATION_BYPASS_SECRET` in the test process to the project's automation bypass secret; Playwright sends it only in request headers. Keep that secret outside the repository. The same command without `SMOKE_BASE_URL` starts a local server; local health may be unconfigured. Install the Playwright browser first with `bunx playwright install chromium`.

## Qlik analytics

Apply migration 0010 before enabling the Next.js Qlik routes. The existing `GET /api/qlik/get-events.php`, `get-matches.php`, `get-leaderboard-results.php`, and `get-leaderboard-players.php` paths return `{ ok, rows }` and require `X-Analytics-Key: <ANALYTICS_KEY>`. Set a distinct server-side key per environment and update the Qlik REST connection only when that environment becomes its source. Do not put this key in a query string or browser code.

The staff-only `/analytics` view uses the existing six Qlik mashup subjects and asks `GET /api/qlik/get-embed-token.php` for a short-lived user impersonation token. Set `QLIK_TENANT_URL`, `QLIK_APP_ID`, `QLIK_EMBED_CLIENT_ID`, `QLIK_M2M_CLIENT_ID`, `QLIK_M2M_CLIENT_SECRET`, and `QLIK_EVENT_VIEWER_SUBJECT` per environment. The M2M secret and subject stay server-side; the browser receives only the access token. The existing Qlik app remains a read-only analytics copy; PaddlePointer continues to write only PostgreSQL.

The mashup JavaScript and stylesheet under `public/` are an isolated copy of the legacy assets for the Next.js deployment. Keep them in sync until the legacy root application is retired; after cutover, the Next.js copy becomes the only served version. Match `played_at` and `ended_at` are the normalized source for Qlik's Tournament Match `startedAt` and `completedAt` fields, including the Event window.

Migration 0010 coalesces source-data writes into a pending reload marker. If triggered reloads are used, set `QLIK_RELOAD_TRIGGER_URL` and `QLIK_RELOAD_TRIGGER_TOKEN` server-side and schedule `bun run qlik:reload-pending` every minute in the deployment environment. Failed triggers leave the marker for retry. Keep Qlik's periodic reload as the backstop. Visitor Matches do not mark Qlik reloads because they are excluded from MTC feeds.

## Database migrations

Domain tables are intentionally deferred to later tickets; the auth tables are now present. `src/server/schema.ts` is the Drizzle schema entry point. For each schema change, update that file, run `bun run db:generate`, review and commit the generated SQL in `drizzle/`, then run `bun run db:migrate` against a disposable development database. Apply the same committed migrations to preview and staging before their deployments. Promote those migrations to production as a separate release step before deploying code that needs them. Set `DIRECT_DATABASE_URL` in the shell that runs `db:migrate`; it is not required by the app at runtime. Do not run `drizzle-kit push` against shared environments.
