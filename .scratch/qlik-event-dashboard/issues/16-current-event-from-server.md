# 16 — Scorers and the Live Board use the Current Event from the server

**What to build:** PaddlePoint gets a real notion of the Current Event instead of always assuming the Tournament id `open_play`. A migration adds a stored Current Event id, seeded to `open_play` so nothing changes for today's single-Tournament setup. Scorers, the Scoreboard, the Tournament view and the Live Board all load the Current Event from the server rather than hard-coding `open_play`. The analytics events endpoint (ticket 03) marks the Current Event's row as current.

**Blocked by:** 04 — Courts right now

**Status:** done (2026-09-18)

- [x] A schema migration stores one Current Event id, defaulting to `open_play`
- [x] Every place in the browser that assumed the Tournament id `open_play` now reads the Current Event from the server instead
- [x] The `/api/qlik/events` endpoint marks exactly one row as current, matching the stored value
- [x] The Courts right now sheet (ticket 04) correctly follows the Current Event when it changes
- [x] Existing tests for Tournament loading still pass unchanged in behaviour for a database with only `open_play`

## Implementation (2026-09-18)

**Migration** `008_current_event` (`api/schema.php`): a small generic `app_settings` table (`setting_key` PK, `setting_value`), seeded with `current_event_id = 'open_play'`. Chosen over a dedicated single-purpose table/column because it's the same shape ticket 17 (Super Admin starts a new event) will need to actually change this value, and any future single-value app setting can reuse it without another migration.

**Server (`api/db.php`)**: `current_event_id(PDO $pdo): string` — the one place every other function reads the Current Event from. No setter yet; ticket 17 owns writing it. Every place that used to default to the literal `'open_play'` now defaults to `current_event_id($pdo)` instead, only when the caller didn't specify an id/tournamentId explicitly (existing explicit-id call sites are completely unaffected):
- `read_tournament()` / `save_tournament()` (`api/tournaments.php`) — blank/missing `id`.
- `update_tournament_match()` (`api/tournaments.php`) — missing `tournamentId` (the Scoreboard's own update path).
- `save_game()`'s `tournamentMatch` handling and `clear_tournament_games()` (`api/games.php`) — missing `tournamentId`.
- `who_am_i()` (`api/sign_in.php`) — now takes `$pdo` and returns a `currentEventId` field in its payload alongside `user`/`permissions`, so the browser learns the Current Event on every session check (`auth.php?action=me`), not just as a request default. `auth.php` and both call sites in `tests/sign_in_test.php`/`tests/access_policy_test.php` updated for the new signature.
- `read_qlik_events()`/`qlik_event_row()` (`api/qlik/events.php`) — `isCurrent` now compares against `current_event_id($pdo)` instead of the literal `=== 'open_play'`. The Courts right now sheet (ticket 04) already derives its "current event" purely from this endpoint's `isCurrent` flag, so it follows automatically with no Qlik-side change needed.
- Also fixed a small adjacent gap while touching `save_tournament()`: it computed the effective `$id` but never wrote it back onto `$tournament['id']`, so a save with no id in the payload replied with a `tournament.id` of `null` even though the row was correctly stored under the Current Event. Now `$tournament['id'] = $id;` right after the id is resolved.

**Browser (`app.js`, `shared-store.js`)**: replaced every literal `"open_play"` fallback with a reference to `defaultTournament.id` (app.js) / the `defaultNormalizeTournament` function's own `base.id` parameter and the `createSharedStore` closure's `defaultTourn.id` (shared-store.js) — never a second hardcoded literal. `hydrateAuth()` (app.js) is the single place that *sets* the real value: on every successful `auth.php?action=me` response, it mutates `defaultTournament.id = payload.currentEventId` and, unconditionally, `state.tournament.id = payload.currentEventId`. Mutating the same object `app.js` already hands to `createSharedStore({ defaultTournament, ... })` means shared-store's own fallback chain (`loadLocalTournament`, `loadTournament`'s third fallback) picks up the change for free — no new option/signature needed on shared-store's public API. The override is deliberately unconditional (not "only if not already set"): if a Super Admin starts a new Event (ticket 17) while a scorer's browser still has the old Event cached, the very next session check should move that scorer onto the new Current Event, not leave them stuck scoring the old one. `defaultTournamentFallback` in shared-store.js (used only if `createSharedStore` is ever called without `options.defaultTournament`, which this app never does) deliberately keeps its literal `open_play` — that's the genuine "seeded to open_play" bottom-of-the-chain default the ticket describes, for a codebase with no server data at all yet.

`tournament-match.js` and `rally-engine.js` also have `"open_play"` defaults, but only as defensive last-resort parameter defaults for a value their callers always supply — left unchanged (fixing the callers' own defaults makes these unreachable in practice, and touching them wasn't needed for any test or manual scenario).

## Verification (2026-09-18)

New tests (all passing, full 15-file PHP suite green): `tests/current_event_test.php` (migration + getter), plus one new test each in `tests/qlik_events_test.php`, `tests/tournament_test.php` (two — save/read with a blank id, and clearing with no tournamentId), `tests/tournament_match_test.php`, `tests/save_game_test.php`, and `tests/sign_in_test.php` — each seeds a second Event, points `current_event_id` at it via a direct `UPDATE app_settings`, and confirms the function under test follows the change rather than defaulting to `open_play`. `tests/schema_test.php`'s two exact-migration-list assertions updated to include `008_current_event`. Full JS suite (`node --test tests/*.test.js`) still green apart from the pre-existing, unrelated `tournament-records-tokens.test.js` failures (stylesheet-token work, noted in the prior session's handoff).

Manually verified end-to-end in the browser (Herd, `http://paddlepoint.test`, a fabricated Super Admin session per the project's dev-session recipe): confirmed `auth.php?action=me` returns `"currentEventId":"open_play"` on the seeded database. Then created a second Event (`summer_bash`) and pointed `current_event_id` at it directly via SQL (simulating what ticket 17's setter will eventually do) — reloading the dashboard with no other change showed "Summer Bash" as the active Tournament instead of "Open Play", no console errors, confirming the browser genuinely follows the server's Current Event rather than any cached/hardcoded value. Reverted the database to `open_play` and cleared the fabricated session afterward.
