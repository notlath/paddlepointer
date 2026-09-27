# Legacy structure import

Ticket 14 imports Events, Players, rosters, rounds, courts, and scheduled Match identities. Game results and Rally history belong to ticket 15. The source inventory currently reports empty databases, so run this when a populated snapshot is available.

1. Apply all Next.js PostgreSQL migrations (`bun run db:migrate`).
2. Point `PP_DB_*` variables at the legacy MySQL database. Export a consistent, read-only snapshot: `php scripts/export-legacy-structure.php > /secure/path/legacy-structure.json`.
3. Set `DATABASE_URL` to the target PostgreSQL database and run `bun scripts/import-legacy-structure.ts /secure/path/legacy-structure.json`.
4. Retain the JSON report and verify the imported Event and Player pages as a staff user. Remove the snapshot from operator storage after reconciliation; it contains player names.

The importer uses `legacy:` IDs, so existing Next.js records are not selected for updates. Repeating the same snapshot is safe. A conflicting target record, invalid source row, or missing relationship fails the import before commit and appears in the report. The importer does not change the Current Event; switch it at cutover after validation.

The exporter reads the relational `players` and `tournament_matches` rows, and the tournament roster and configuration from `tournament_json`. It intentionally excludes games, scores, user accounts, and Qlik credentials. All counts in the report refer to source rows and planned canonical rows. A successful report has `committed: true` and empty `rejected`, `relationshipDiscrepancies`, and `targetConflicts` arrays.

Run `bun run test:legacy-structure` for fixture checks. To run its PostgreSQL integration check, set `MIGRATION_TEST_DATABASE_URL` to a disposable database that has the Next.js migrations applied; the test imports a unique fixture twice, verifies foreign-key joins, and removes its rows.
