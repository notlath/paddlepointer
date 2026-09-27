# Legacy Match and Visitor import

Ticket 15 extends the read-only snapshot from ticket 14. Run the structure import first, then run `bun scripts/import-legacy-matches.ts <snapshot.json> [verified-visitor-map.json]` with `DATABASE_URL` pointed at the target PostgreSQL database. The Match import is transactional and repeatable. It reports source, planned, and committed counts separately, and rolls back if any source identity, score, Rally, or target relationship fails validation.

Visitor history requires a separate JSON map whose keys are legacy numeric user IDs and values are existing Next.js user IDs, for example `{ "7": "target-user-id" }`. Review every mapping manually. The importer checks that each target user is active, email verified, and has the Visitor role. It never guesses a Visitor owner by name or email. Keep the snapshot and mapping out of the repository; both contain private identity information.

Regular Matches use relational columns and `match_player` links. Only the ordered Rally log remains in JSONB. Visitor Matches use the existing owner-scoped `visitor_match` model and remain outside Events. Staff can inspect regular Match scores and Rallies at `/matches/<id>`; Visitors can inspect only their own history at `/visitor`.

Run `bun run test:legacy-matches` for fixture checks. Set `MIGRATION_TEST_DATABASE_URL` to a disposable, migrated PostgreSQL database to include the integration check. The integration check imports completed and active fixtures twice, verifies Rally order, scores, Player and Visitor relationships, and removes its rows.
