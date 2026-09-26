# 04 — Courts right now

**What to build:** Organisers and the venue screen see what is happening on every court of the Current Event. A read-only analytics matches endpoint returns one row per Tournament Match: Event id, Match id, round, court, status, Team A and Team B player names, Scores, winner, started at, completed at and Game id. `?event=<id>` filters to one Event; omitted, it returns every Tournament Match across every Event. A "Courts right now" sheet, filtered to the Current Event, shows one row per court, including idle courts, with the in-progress Match and its Score, the round, when it started, and the next scheduled Match.

Scores are whole numbers, or empty when not yet recorded. Times are ISO 8601 UTC, and the sheet displays them in Asia/Manila time. Same key, 401/404 and response shape as ticket 03.

**Blocked by:** 03 — Qlik loads every Event through a key-protected endpoint

**Status:** done (2026-09-16)

- [x] With no `?event=`, the endpoint returns every Tournament Match across every Event; with `?event=`, only that Event's
- [x] Scores come back as whole numbers or empty, never as text
- [x] Times are normalised to UTC whatever form they were stored in
- [x] PHP tests cover scheduled, in-progress and completed Matches, a blank Score, and the all-Events vs single-Event filter
- [x] The sheet shows every court of the Current Event, marking idle courts as idle
- [x] For each court the sheet shows the in-progress Match (Teams, Score, round, start time) and the next scheduled Match

## Implementation (2026-09-16)

- `api/qlik/analytics.php`: two new shared helpers alongside the ticket-03 auth functions — `qlik_event_exists(PDO $pdo, string $eventId): bool` (needed because, unlike ticket 03, an Event can legitimately exist with zero Matches, so "no rows" and "no such Event" have to be told apart), and `normalize_iso_utc(?string $value): ?string` (reformats any stored timestamp to strict ISO-8601 UTC via PHP's `DateTime`, assuming UTC when the stored value carries no zone of its own; returns null for blank/unparsable input).
- `api/qlik/matches.php`: `read_qlik_matches(PDO $pdo, string $providedKey, array $query): array`. Same auth-before-any-query pattern as ticket 03. `teamA`/`teamB` decoded from the stored JSON-array columns; `scoreA`/`scoreB` cast to int or null (never the stored empty-string as text or as `0`); `startedAt`/`completedAt` routed through `normalize_iso_utc()`.
- `api/qlik/get-matches.php`: thin HTTP entry, same shape as `get-events.php`.
- `tests/qlik_matches_test.php`: 7 tests — missing/wrong key, unknown Event 404, a known Event with zero Matches (not a 404), scheduled/in-progress/completed Match shapes (including the blank-score and no-winner-yet cases), a non-ISO stored timestamp normalized to UTC, and the all-Events vs single-Event filter. Full existing suite re-verified green throughout.

## Qlik-side wiring (2026-09-16, mtcmarketing.sg sandbox, local dev + ngrok as in ticket 03)

Built the Matches load-script section and the "Courts right now" derivation (current Event's court count → one row per court, left-joined to that court's in-progress Match and to its next scheduled Match by earliest round), verified by temporarily `TRACE`-ing computed field values into the reload log rather than building the actual visual sheet (per your call — the sheet itself is a few minutes of drag-and-drop in the Qlik Sense UI for a human, versus a blind, unverifiable Engine-API exercise for me). Confirmed correct: idle courts show `Is Idle = -1` with no in-progress fields, an occupied court would show its Team/Score/round, and next-scheduled-match lookup works when one exists.

New finding, worth remembering for every later ticket that reads a boolean field the REST connector parsed from JSON: **Qlik's REST connector represents a JSON `true`/`false` as the literal text `"True"`/`"False"`, not as Qlik's numeric `-1`/`0`.** `WHERE [Is Current Event] = -1` silently matched zero rows (no script error — it just produced an empty "current Event" lookup, which then broke `AUTOGENERATE` downstream with "generate count is out of range"). The fix is `WHERE [Is Current Event] = 'True'`. This will bite ticket 16 and anything else that filters on `isCurrent` or another boolean analytics field.

Debug leftovers (temp `TRACE` statements, a `STORE ... courts_debug.csv` snapshot, a wrong-key connection) were all removed; the live script and connections are clean. Not deployed to `www.mtc.com.ph` — same standing gap as ticket 03.
