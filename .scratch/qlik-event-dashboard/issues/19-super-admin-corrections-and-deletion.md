# 19 — Super Admin corrections and deleting empty Events

**What to build:** History can be fixed, but not wiped. A Super Admin can correct a finished Match's Scores and winner in any Event, past or current, and that correction is reflected in the Leaderboard and in `/api/qlik/results` on the next reload. A Super Admin can also delete an Event that has no finished Matches at all (for example one created by mistake); an Event with any finished Match refuses deletion.

**Blocked by:** 18 — Past Events are protected

**Status:** done (2026-09-18)

- [x] A Super Admin-only action corrects a finished Match's Scores and winner in any Event
- [x] The correction updates the stored Game/Match record so `read_leaderboard` and the analytics results endpoint both reflect it immediately
- [x] A Super Admin-only action deletes an Event with zero finished Matches, removing its Tournament and any scheduled/in-progress Matches
- [x] Deleting an Event that has at least one finished Match is refused with a clear error
- [x] Admins and other roles cannot correct past Matches or delete Events
- [x] Tests cover a correction, a successful deletion of an empty Event, and a refused deletion of a non-empty Event

## Implementation (2026-09-18)

**Access Policy (`api/access_policy.php`)**:
- Added `'correct_match'` and `'delete_event'` to the Super Admin-only actions in `can()`.
- Added `'correct_match'` and `'delete_event'` to `$actions` in `permissions_for()`.

**Server Handlers (`api/tournaments.php`)**:
- `correct_tournament_match(PDO $pdo, ?array $currentUser, array $data): array`:
  - Enforces `can($currentUser, 'correct_match')` (Super Admin only; returns 401 for unauthenticated, 403 for other roles).
  - Validates tournament and match existence (404 if not found).
  - Enforces that only matches with status `'completed'` may be corrected (400 for scheduled or in-progress).
  - Cleans scores with `clean_match_score()`, ensures both are numeric, and prohibits tied scores (400).
  - Validates that winner ('A' or 'B') matches the higher score (or infers winner if omitted).
  - In a single database transaction:
    - Updates `tournament_matches` table (`score_a`, `score_b`, `winner`, `match_json`).
    - Updates corresponding `games` record if linked (`team_a_score`, `team_b_score`, `winner_team`, `winner_name`, `game_json`).
    - Touches `tournaments.updated_at` to notify polling clients.
- `delete_event(PDO $pdo, ?array $currentUser, array $data): array`:
  - Enforces `can($currentUser, 'delete_event')` (Super Admin only; returns 401 for unauthenticated, 403 for other roles).
  - Validates tournament existence (404 if not found).
  - Verifies count of completed matches in `tournament_matches` and finished games in `games`. If any exist, refuses deletion with HTTP 400 (`'An Event with finished matches cannot be deleted'`).
  - If zero finished matches exist:
    - Deletes all scheduled and in-progress matches from `tournament_matches`.
    - Deletes any unfinished `games` and `game_players` linked to the tournament.
    - Deletes the tournament row from `tournaments`.
    - If the deleted event was the Current Event (`current_event_id`), falls back `current_event_id` to the most recent remaining tournament in `tournaments` (or `'open_play'`).

**HTTP Endpoints (`api/correct-match.php`, `api/delete-event.php`)**:
- Standard REST POST endpoints following repository conventions (`handle_options()`, `pdo_connection()`, `user_from_request()`, `send_json()`).

## Verification (2026-09-18)

- Dedicated test suite in `tests/event_corrections_and_deletion_test.php` (7 tests, all passing):
  1. `test_roles_refused_match_correction`: confirms Admin, Player, Visitor, and signed-out callers are refused with 403/401.
  2. `test_super_admin_corrects_finished_match_in_past_event`: confirms Super Admin correction of a finished match in a past Event updates `tournament_matches` and `games` in MySQL, and immediately reflects in `read_leaderboard()` and `read_qlik_leaderboard_results()`.
  3. `test_match_correction_guardrails`: verifies refusal of unfinished matches (400), tied scores (400), non-existent match/tournament (404), and winner contradicting scores (400).
  4. `test_roles_refused_event_deletion`: confirms non-Super Admin roles cannot delete events (403/401).
  5. `test_delete_event_with_finished_matches_is_refused`: verifies attempting to delete an event with completed matches returns 400 and preserves all records in MySQL.
  6. `test_super_admin_deletes_empty_event_and_cleans_up`: verifies Super Admin deletes an empty event, removing its tournament and scheduled/in-progress matches.
  7. `test_delete_current_empty_event_falls_back_current_event_id`: verifies fallback of `current_event_id` when the deleted event was active.
- Access policy suite in `tests/access_policy_test.php` (4/4 passed).
- All 18 PHP test suites pass with zero failures (`$env:PP_TEST_DB_PORT="3306"; Get-ChildItem tests/*_test.php | ForEach-Object { php $_.FullName }`).
- All 20 JS unit tests pass (`node --test tests/session.test.js tests/shared-store.test.js`).

