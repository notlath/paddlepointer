Type: grilling
Status: resolved
Blocked by: 02, 04, 05, 06

Decision: Rehearse a restartable, source-ID-mapped MySQL-to-PostgreSQL copy while PHP/MySQL remains the only production writer. Cut over between Events after a write freeze, final sync, zero-unexplained-difference reconciliation, and explicit operator go/no-go. Keep MySQL read-only after the switch. Before the first Supabase production write, traffic may return to PHP/MySQL while the freeze remains in force; afterward, repair Supabase forward from its own state.

## Question

What staged data-copy, validation, traffic-switch, and rollback plan will move production use from the current MySQL/PHP application to the new Next.js/Supabase application? Decide how writes are controlled while both systems exist, how complete event and visitor history is verified, what the final cutover gate is, and what rollback means once the new system has accepted writes.

## Copy and rehearsal

- Inventory the production MySQL schema, row counts, account readiness, and every data source before writing the importer. Include Events/Tournaments and their Schedules, Rounds, courts and Tournament Matches; finished and in-progress Matches, Team membership and ordered Rally logs; Players, skill levels and account links; Visitor identities and private Match history; and relevant application settings. Treat legacy session tokens as expired, not importable identities. Resolve ambiguous Player/Visitor ownership and staff credentials before release rather than guessing during import.
- Apply reviewed Drizzle SQL migrations to an isolated Supabase staging database, then copy a consistent MySQL snapshot in dependency order. Retain a reviewed legacy ID to new ID map for every imported entity and use it for references and repeat runs. Import batches must be restartable and idempotent: retrying a rehearsal updates the mapped record or reports a conflict, without duplicating records or overwriting unrelated target data. Reject malformed or unmapped records into an explicit exception report. Keep extraction and import credentials outside browser and client builds.
- Rehearse with a representative full data copy while PHP/MySQL continues to own production writes. Do not send production users or Qlik to the staging database. Repeat the rehearsal after corrections; record snapshot time, source and target schema versions, import version, elapsed time, exceptions, and reconciliation results so the freeze window can be estimated from evidence.

## Reconciliation gate

- Compare source and target counts by Event and entity, including inactive accounts, unfinished Matches, Visitor Matches, Rally entries, Player links, Tournament Match links, and settings. Preserve source identifiers or mapping evidence so every source record is accounted for exactly once. A count match alone is insufficient: check required references, uniqueness, Event ownership, Current Event, Match status, scores, timestamps, ordered Rally sequence and derived totals, Player identities, and Visitor ownership/isolation.
- Compare the four Qlik feed payloads and derived summaries against the PHP contract for all historical eligible Events, accounting only for documented ordering or serialization differences. Exercise feed key access, staff analytics token exchange, and optional reload behavior in staging. Verify authorized Next.js views can read imported records without exposing private Visitor data.
- The production gate is zero missing, duplicate, rejected, orphaned, or unexplained mismatched records and zero unexplained score, Rally, ownership, or Qlik semantic differences. Every intentional transformation needs an approved, recorded source-to-target explanation; it cannot be hidden by an aggregate count. Publish the reconciliation report and named operator sign-off before unfreezing writes. Exact scripts, schema constraints, timing budget, and report format belong to delivery tickets 14–17.

## Production switch and recovery

1. Schedule the switch between Events, with no active scoring or unfinished operational work accepted for the window. Announce the freeze, identify the operator who can abort, verify backups and restore access, and verify the Next.js deployment, Supabase schema, Better Auth/email configuration, Qlik secrets, and routes in the production environment.
2. Stop every PHP write path, including staff, scorer, Visitor, background jobs, and direct database writers; block new writes at the MySQL database as a backstop. Record the final MySQL snapshot or high-water mark and confirm that no writes can continue. Keep Next.js writes disabled while the final sync runs.
3. Run the idempotent final sync from the frozen source, then the full reconciliation gate. On any unexplained difference, keep production frozen or restore PHP/MySQL as the sole writer before opening traffic. Never allow both applications to accept writes.
4. Point application traffic and Qlik feed consumers to the verified Next.js deployment. While writes remain disabled, smoke-test staff sign-in, Event and Match history, Visitor access/isolation, Live Board reads, and Qlik feeds. Then enable Supabase writes and test a controlled Match save and other write paths. Record the instant of the first accepted production write as the recovery boundary.
5. After that boundary, Supabase is the sole writable authority. Keep MySQL read-only for historical inspection; retire PHP endpoints only after replacement application and Qlik contracts are verified. For an incident, pause Supabase writes, preserve its state and logs, restore service or correct data in Supabase, then revalidate. Do not reverse-sync or reopen MySQL writes from a stale snapshot.

## Delivery checks

- Tickets 14 and 15 implement repeatable imports with representative fixtures and explicit exceptions. Ticket 16 produces a repeatable full reconciliation and Qlik parity report. Ticket 17 owns the timed runbook, named sign-offs, freeze, traffic switch, smoke tests, and recovery drill.
- A rehearsal proves a second import does not duplicate or erase data, and an interrupted batch can resume. A simulated mismatch must fail the gate. A cutover rehearsal proves that each side's write lock is effective and that the first Supabase write changes the recovery path.
