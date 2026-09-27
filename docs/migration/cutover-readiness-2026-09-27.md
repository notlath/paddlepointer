# Cutover readiness check — 2026-09-27

This is a read-only inventory of the connected services for ticket 17. It does not authorize or record a production switch.

| Check | Observed result | Cutover implication |
| --- | --- | --- |
| Supabase projects visible to the connected account | Only `paddlepointer-next-preview` (`xrkgxbqwvikvkgclwgau`), marked active and healthy. | No distinct production project is available through this connection. |
| Preview database schema | `account`, `session`, `user`, and `verification` exist; `event` and `match` do not. Neither `public.__drizzle_migrations` nor `drizzle.__drizzle_migrations` exists. | The preview database has not received the domain migrations and cannot pass application/Qlik cutover checks. |
| Preview data | `user` and `session` each have zero rows. | This says nothing about an unconnected production database or the legacy MySQL source. |
| Vercel connection | `lathrells-projects` project read returned HTTP 403; team listing returned zero teams. | Deployment, environment, routing, and freeze state cannot be verified or changed through the connected Vercel account. |
| Legacy MySQL and production URL | No production MySQL connection or public production URL is supplied in the workspace. The operator previously reported that there is no real legacy MySQL data. | Source emptiness and a between-Events window still need confirmation at the actual cutover. |

**Next operational inputs:** identify the intended production Supabase project (or explicitly designate a new one), reconnect Vercel with access to `lathrells-projects`, provide the public application domain and Qlik connection owner, and schedule a between-Events window with a named go/no-go owner. Then follow [the cutover runbook](cutover-runbook.md). Do not point production traffic at the current preview database.
