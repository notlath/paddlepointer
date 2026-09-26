# 18 — Past Events are protected

**What to build:** Regenerating the schedule, resetting a Tournament, and clearing results only ever act on the Current Event. Once ticket 17 lets a new Event start, these destructive actions must refuse to touch a past Event, so history from a finished Event can't be wiped by mistake or by an old browser tab still pointed at it.

**Blocked by:** 16 — Scorers and the Live Board use the Current Event from the server

**Status:** done (2026-09-18)

- [x] Regenerate schedule, reset Tournament and clear results all check the target Tournament id against the stored Current Event id
- [x] A request naming a past Event's id is refused with a clear error, not silently redirected to the Current Event
- [x] The same actions still work normally on the Current Event
- [x] A test covers attempting each destructive action against a past Event after ticket 17's new-Event flow

## Implementation (2026-09-18)

**Server (`api/tournaments.php`, `api/games.php`)**:
- In `save_tournament()` (`api/tournaments.php`): after acquiring the row lock on `tournaments`, checks whether the target `$id` is an existing Tournament that is not the Current Event (`$existingRow && $id !== current_event_id($pdo)`). When this condition holds:
  - Destructive intent `'schedule-update'` (regenerating schedule) or empty intent `''` (when Super Admin would otherwise overwrite the schedule) returns `[400, ['ok' => false, 'error' => 'Past events are protected; only the current event schedule can be regenerated']]`.
  - Destructive intent `'reset'` returns `[400, ['ok' => false, 'error' => 'Past events are protected; only the current event can be reset']]`.
  - Destructive intent `'clear-results'` returns `[400, ['ok' => false, 'error' => 'Past events are protected; only the current event results can be cleared']]`.
  - The transaction is rolled back and no records in `tournaments` or `tournament_matches` are modified.
- In `clear_tournament_games()` (`api/games.php`):
  - Checks if a non-empty `tournamentId` was supplied that does not match `current_event_id($pdo)`.
  - If it targets a past Event, immediately returns `[400, ['ok' => false, 'error' => 'Past events are protected; only the current event games can be cleared']]`.
  - If `tournamentId` is omitted, it defaults to the Current Event and clears only the Current Event's games as before.

## Verification (2026-09-18)

- New test file `tests/past_events_protected_test.php` with 5 tests:
  1. `test_regenerate_schedule_on_past_event_is_refused`: confirms attempting `save_tournament` with `intent: 'schedule-update'` naming `open_play` after `Fall Classic` has started is refused with 400 and keeps `open_play` matches intact.
  2. `test_reset_tournament_on_past_event_is_refused`: confirms attempting `intent: 'reset'` against `open_play` is refused with 400 and keeps `open_play` matches intact.
  3. `test_clear_results_on_past_event_is_refused`: confirms attempting `intent: 'clear-results'` against `open_play` is refused with 400 and keeps `open_play` match scores and statuses intact.
  4. `test_clear_games_on_past_event_is_refused`: confirms attempting `clear_tournament_games` naming `open_play` is refused with 400 and preserves `open_play` games and player records in MySQL.
  5. `test_destructive_actions_work_normally_on_current_event`: confirms all destructive actions continue to work normally (HTTP 200) on the Current Event (`Fall Classic`), and verifies past Event data remains intact afterwards.
- Full PHP suite of 17 test files passes with zero failures.
- All non-stylesheet JS unit tests continue to pass.
