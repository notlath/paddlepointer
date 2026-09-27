# Production cutover: PHP/MySQL to Next.js/PostgreSQL

This is the operator checklist for ticket 17. Execute it **between Events**, with a named cutover lead, PHP/MySQL owner, Next.js/PostgreSQL owner, and Qlik owner. Record the planned window, production URLs, deployment identifiers, owner names, and the go/no-go decision in a private change record. The repository has no production host or DNS access, so no traffic switch is implied by this document.

The operator has reported that there is no real legacy MySQL data. Treat that as an inventory to verify at the window, not as proof that the source stayed empty. If MySQL contains real users, Players, Events, Matches, or Visitor history, stop the empty-source path and use the snapshot, account mapping, and import path below. Never import the disposable rehearsal fixture into production.

## Before the window

1. Confirm no Event is active or scheduled during the window. Name the incident channel, approver, and a maximum freeze duration. Notify staff, scorers, Visitors, Players, and spectators of the start time, expected temporary write pause, and the new URL if it changes. The lead announces the actual freeze and resume times.
2. Confirm the intended Next.js production deployment, PostgreSQL migrations, environment variables, `/api/health`, sign-in, and role permissions. Confirm a fresh backup and restore point for each production database. Confirm the old PHP site and MySQL can be put in read-only mode independently of application settings.
3. Verify the final source inventory with the PHP/MySQL owner. For an empty source, record counts of users, Players, Events, Matches, and Visitor Matches as zero and skip import. If it is populated, complete the guarded rehearsal in [the rehearsal runbook](rehearsal-runbook.md), resolve every failure and review item, verify each Visitor/Player account map, and agree how the Current Event will be set. Keep private snapshots and reports outside Git.
4. Confirm the four Next.js Qlik feed paths (`/api/qlik/get-events.php`, `get-matches.php`, `get-leaderboard-results.php`, `get-leaderboard-players.php`) answer with the expected `{ ok, rows }` contract using `X-Analytics-Key`. Verify the staff `/analytics` view, embed token configuration, and a Qlik reload. Record the existing Qlik connection and its intended replacement. Keep its periodic reload enabled as a backstop.
5. Prepare `PP_WRITE_FREEZE=1` on **both** PHP and Next.js deployments. Changes to hosted environment variables may require a deployment/restart; confirm propagation with a harmless mutating request and an HTTP 503 response. Keep `PP_WRITE_FREEZE=1` on Next.js until the lead releases the freeze. Stop background jobs that can write, including Qlik reload triggers, before the final source snapshot. The PHP HTTP gate is a convenience; the MySQL read-only permission is the source backstop.

## Freeze, final sync, and decision

1. The lead announces the freeze. Enable `PP_WRITE_FREEZE=1` on PHP and Next.js, stop all PHP writers/cron jobs, and block writes at the MySQL account or database layer. Verify a write attempt is rejected at both HTTP entry points. Record the freeze timestamp and source row counts. Keep the old site available for reads while validating.
2. If the source is empty, independently confirm the five inventory counts are zero. Do not copy the rehearsal fixture. If populated, take a **consistent** final MySQL snapshot after the freeze:

   ```sh
   cd next-app
   php scripts/export-legacy-structure.php > /secure/path/final-snapshot.json
   ```

   With verified account mappings, run the importers against the intended PostgreSQL database using `DATABASE_URL` (the importers are idempotent and fail on conflicts). Import structure first, then Matches/Visitor Matches. Link Player accounts only against reviewed IDs. Capture each import report and confirm `committed: true`. Do not run `migration:rehearse` against production: its write mode is guarded for a disposable test database.
3. Run read-only reconciliation against the **production** target with a read-only PostgreSQL credential in `CUTOVER_DATABASE_URL`:

   ```sh
   cd next-app
   bun --env-file=.env scripts/rehearse-migration.ts --verify-only --snapshot /secure/path/final-snapshot.json --visitor-map /secure/path/visitor-map.json --player-map /secure/path/player-map.json --report /secure/path/final-reconciliation.json
   ```

   For an empty source, record the zero counts and inspect the production target directly instead; there is no legacy snapshot to reconcile. The verifier checks identities, counts, scores, Rally order, account ownership, Visitor isolation, and all four Qlik feeds for snapshot records. It does not prove the absence of unrelated target records, so review target inventory separately. Require zero failed checks and resolve every review item. Compare the source digest and counts to the frozen export and the accepted rehearsal. A Current Event review item requires an explicit target setting decision.
4. The lead records **go** only when freeze is confirmed, source/target inventory is explained, reconciliation and Qlik contracts pass, health and role access pass, backups exist, and the traffic/Qlik owners are ready. Record approver and time. Any unexplained mismatch, active Event, unverified account mapping, failed Qlik contract, or unconfirmed freeze is **no-go**. Keep both systems frozen while fixing it, or cancel the window and restore the old site before any PostgreSQL production write.

## Switch and verify

1. Route application traffic to the confirmed Next.js deployment. Check the public URL and `/api/health`; verify the deployment is connected to the intended PostgreSQL database. Keep `PP_WRITE_FREEZE=1` until the smoke checks below pass. Do not configure dual writes.
2. Point the Qlik REST connection to the Next.js feed URL with its production analytics key. Reload the app; compare feed row counts/totals and open the staff `/analytics` mashup. Verify pending reload handling and periodic reload. Record the Qlik owner’s result.
3. While Next.js is frozen, check the read-only parts of these journeys and confirm mutating requests return HTTP 503. Then the lead releases the Next.js freeze (`PP_WRITE_FREEZE=0`, with deployment/restart if needed) and makes one controlled PostgreSQL production write. Verify it succeeded and record its timestamp as the **first successful PostgreSQL production write** and recovery boundary. Keep PHP and MySQL frozen. Complete the write journeys below on the public URL with dedicated test accounts and a controlled test Event. Record account, time, URL, expected result, actual result, and evidence.

   | Role | Browser journey |
   | --- | --- |
   | Staff | Sign in, open dashboard, manage an Event/roster/Match, open history and `/analytics`; confirm forbidden roles cannot manage. |
   | Scorer | Sign in, open an assigned Tournament Match, score a Rally, undo where allowed, and confirm Live Board/history update. |
   | Visitor | Sign in, create and score a private Visitor Match, view own history, and confirm another Visitor cannot open it. |
   | Player | Sign in, view only the linked Player summary and Match history. |
   | Spectator | Open the public Live Board without an account and confirm live scores update. Confirm protected history redirects to sign-in. |
   | Qlik owner | Fetch all four keyed feeds, reload the Qlik app, inspect totals, and view the staff mashup. |

4. The lead announces service resumed after the journeys and Qlik checks pass. Keep MySQL read-only and stop all PHP background jobs. Disable PHP routes and remove the old application from traffic only after the application and Qlik contracts above pass. Retain the MySQL backup/database read-only under the agreed retention policy.

## Recovery and closure

Before the first PostgreSQL production write, a failed switch can route users back to the still-frozen PHP site, then release its freeze only after the source owner confirms it is authoritative. After the first PostgreSQL production write, **fix forward in Next.js/PostgreSQL**. Do not reverse-sync into MySQL or reopen PHP writes: doing so can lose or fork new data. Escalate through the named incident lead, preserve PostgreSQL writes and logs, repair the affected route or data, and re-run the role and Qlik checks.

The lead closes the change only after the browser/Qlik evidence is attached, MySQL read-only is verified, PHP traffic and jobs are disabled, and staff/Visitors/Players are told the new system is live. Record any residual issues and their owner in the change record.
