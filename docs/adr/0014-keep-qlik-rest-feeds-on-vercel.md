---
status: accepted
---

# Keep Qlik REST feeds and batch reloads on Vercel

The Next.js migration keeps Qlik Cloud as a read-only analytics copy. Next.js Route Handlers preserve the four existing `/api/qlik/*.php` feed URLs and `X-Analytics-Key` contract, deriving rows from PostgreSQL rather than duplicating legacy Match JSON. A staff-only Route Handler exchanges server-held M2M credentials for the short-lived Qlik token needed by PaddlePointer's native analytics UI. Keeping these contracts avoids a Qlik connector and analytics rewrite during the application cutover.

## Consequences

- A Vercel Cron GET route drains a durable pending-reload token once per minute when the production plan supports it, using a required `CRON_SECRET`, a database lease, and compare-and-clear so overlapping runs and newer writes are handled safely. Qlik's existing 15-minute Event-hours scheduled reload remains the independent backstop. Vercel Hobby permits only daily Cron jobs, so production on Hobby omits the optional minute trigger.
- All analytics keys, OAuth client secrets, impersonation subject, Qlik automation credentials, and Cron secret live in server-only environment settings. The Qlik tenant URL and public native-client app settings must match each environment. Preview and staging use separate Qlik resources or disable triggering; they never reload the production analytics copy.
- Feed, token, and reload behavior require contract tests and a staging Qlik rehearsal before production cutover. Qlik never becomes a write path or the source of Live Board freshness.
