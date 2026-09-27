# Migration rehearsal and cutover evidence

Ticket 16's rehearsal runs only against `MIGRATION_TEST_DATABASE_URL`. The command refuses a test URL on the same host as `DATABASE_URL` or `DIRECT_DATABASE_URL`. It also requires a database-side `migration_rehearsal_guard` row whose SHA-256 token hash matches `MIGRATION_TEST_GUARD_TOKEN` in `next-app/.env`; a hostname difference alone is insufficient proof of isolation. Apply all Next.js migrations and initialize the guard on the disposable database before running it. Never copy the guard table or token into production. The representative fixture leaves its namespaced records in the test database so a repeat run tests idempotence. Drop the disposable database when the rehearsal is no longer needed.

After checking that `MIGRATION_TEST_DATABASE_URL` points to the disposable database, generate a random token, add it as `MIGRATION_TEST_GUARD_TOKEN` in `next-app/.env`, and initialize the guard once from `next-app/`:

```bash
bun --env-file=.env -e 'import postgres from "postgres"; import {createHash} from "node:crypto"; const token=process.env.MIGRATION_TEST_GUARD_TOKEN; if (!token || token.length < 32) throw new Error("Set a random guard token of at least 32 characters"); const hash=createHash("sha256").update(JSON.stringify(token)).digest("hex"); const sql=postgres(process.env.MIGRATION_TEST_DATABASE_URL,{max:1,prepare:false}); try { await sql`CREATE TABLE IF NOT EXISTS migration_rehearsal_guard (singleton integer PRIMARY KEY CHECK (singleton = 1), token_hash text NOT NULL)`; await sql`INSERT INTO migration_rehearsal_guard (singleton, token_hash) VALUES (1, ${hash}) ON CONFLICT (singleton) DO UPDATE SET token_hash=EXCLUDED.token_hash`; } finally { await sql.end(); }'
```

From `next-app/`, run:

```bash
bun --env-file=.env scripts/rehearse-migration.ts --fixture --report /secure/path/rehearsal-first.json
bun --env-file=.env scripts/rehearse-migration.ts --fixture --report /secure/path/rehearsal-repeat.json
```

Compare `sourceDigest` and `comparisonDigest` across reports. The first proves the source snapshot is unchanged; the second covers checks, differences, and review items. A report with `status: fail` blocks cutover. A `review` item needs an operator decision recorded before cutover. The fixture currently reports one review item: its source Current Event is intentionally not switched by the import scripts; that switch belongs to cutover. The [fixture report](fixture-reconciliation.json) records 32 passing checks and no failures from the guarded disposable Neon database. Two runs produced the same comparison digest.

If a real legacy MySQL source appears, first export a consistent snapshot with `php scripts/export-legacy-structure.php > /secure/path/snapshot.json`. Provision and verify target accounts separately. Create a Visitor map from legacy user IDs to verified, active target Visitor IDs, and a Player account map from legacy user IDs to target Player user IDs. Then run:

```bash
bun --env-file=.env scripts/rehearse-migration.ts --snapshot /secure/path/snapshot.json --visitor-map /secure/path/visitor-map.json --player-map /secure/path/player-map.json --report /secure/path/reconciliation.json
```

The Visitor and Player maps are JSON objects such as `{ "7": "target-user-id" }`. The rehearsal never guesses an account link. It checks source and target counts, canonical IDs, Event/Match references, scores, ordered Rally logs, Player links, account ownership, Visitor isolation through the application read path, and the four Qlik feeds against source-derived expectations. It reports count and digest for each Qlik feed; a mismatch is a failure. Keep snapshots, maps, and real-data reports outside the repository because they contain names and account IDs.

For production cutover, resolve every failure and review item, run a final source export after the write freeze, and compare the final report with the last accepted rehearsal. The rehearsal script itself does not switch the Current Event or write to the production database.
