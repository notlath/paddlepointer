# 03 — Qlik loads every Event through a key-protected endpoint

**What to build:** A thin first path from PaddlePoint to Qlik, now scoped to every Event rather than one. A read-only analytics events endpoint returns one row per Event: its id, name, courts, Event window (first Match start to last Match end), Match count, and whether it is the Current Event. `?event=<id>` is an optional filter; omitted, it returns every Event. Only a caller that sends the analytics key in a request header can read it. In the Qlik tenant, a REST connection loads these rows into the Event dashboard app.

Every analytics endpoint answers in the same shape: `ok` plus a list of `rows`. Times are ISO 8601 UTC. Until ticket 16 ships a stored Current Event, `open_play` is reported as current. See ADR 0001, ADR 0002 and the Event, Current Event and Analytics copy entries in CONTEXT.md.

**Blocked by:** None — can start immediately

**Status:** done (2026-09-16)

- [x] The analytics key is configured on the server next to the other server settings, and is never committed with a real value
- [x] A request without the key, or with a wrong key, gets 401. A key sent in the URL query string is not accepted
- [x] A request with an unknown `?event=` value gets 404
- [x] A request with no `?event=` returns one row per Event that has ever existed
- [x] Each row's Event window is null when the Event has no Matches yet
- [x] Nothing from user accounts or sessions is ever returned
- [x] PHP tests cover 401, 404, the all-Events list, and a single-Event filter
- [x] The Event dashboard app loads the Events table through the REST connection

## Implementation (2026-09-16)

- `api/config.php`: `ANALYTICS_KEY` constant, empty by default. Effective value at runtime is `getenv('ANALYTICS_KEY') ?: ANALYTICS_KEY`, so production sets it via the `ANALYTICS_KEY` environment variable — no real key ever committed.
- `api/qlik/analytics.php` (new, shared by all future `/api/qlik/*` tickets): `analytics_key_from_request()` reads only the `X-Analytics-Key` header, never `$_GET`; `analytics_key_conflict()` returns the `[401, ...]` conflict or `null`.
- `api/qlik/events.php`: `read_qlik_events(PDO $pdo, string $providedKey, array $query): array`, the pure/testable seam. Queries `tournaments` (one row per Event ever created) joined via correlated subqueries to `MIN(started_at)`/`MAX(completed_at)` from `tournament_matches` for the Event window — both columns are already ISO 8601 UTC strings, so no timezone conversion needed. `matchCount` reuses the existing `tournaments.match_count` counter rather than recomputing. `isCurrent` is hardcoded to `id === 'open_play'` per this ticket's note (ticket 16 replaces it).
- `api/qlik/get-events.php`: thin HTTP entry, mirrors `get-tournament.php`/`get-leaderboard.php` conventions.
- `tests/qlik_events_test.php`: 5 tests (missing/wrong key, unknown event 404, all-events list with populated vs. null Event window, single-event filter, query-string key ignored). Full existing suite re-verified green after every change.

## Qlik-side wiring (2026-09-16, mtcmarketing.sg sandbox tenant)

Verified end-to-end against **local dev** (`http://paddlepoint.test/`), tunneled to the internet with ngrok since Qlik Cloud can't reach a local-only hostname. Not deployed to `www.mtc.com.ph` — that's still pending; whoever deploys this needs to set `ANALYTICS_KEY` in that server's environment and point the Qlik connection at the real domain instead of the throwaway ngrok URL.

Findings worth carrying into later tickets:

- **REST connector header syntax:** the connect-string parameter for custom HTTP headers is `queryHeaders` (format `queryHeaders=HeaderName%2HeaderValue%1`, same delimiter scheme as `queryParameters`) — **not** `customQueryHeaders`, which silently creates a connection that never sends the header (no error, just a 401 you have to notice yourself). Confirmed via ngrok's request inspector showing the header was absent.
- **Same shared-space gotcha as ticket 02:** a new REST connection created in the `PADDLEPOINT EVENT` shared space failed reload with "connection not found," identical to ticket 02's finding. Fixed the same way — the connection lives in the personal/default space, only the app is in the shared space.
- **Field-name collisions cause synthetic key loops:** the Events table's `name`/`courts` fields initially collided with the existing `tournament` table's fields in the same app, auto-associating two unrelated tables. Fixed by qualifying the Events table's field names (`Event Id`, `Event Name`, `Event Courts`, `Match Count`, `Is Current Event`). Worth remembering when adding more `/api/qlik/*` tables to this or the real production app.
- Reload succeeded end-to-end: 269 rows read, no errors, no loop warning after the field-name fix.
