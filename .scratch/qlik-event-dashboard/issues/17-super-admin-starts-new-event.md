# 17 — A Super Admin starts a new Event

**What to build:** A Super Admin can start a new Event without losing the previous one. Starting a new Event asks for a name and court count, creates a new Tournament with its own id, and makes it the Current Event (ticket 16). The previous Event keeps its Matches and Games untouched, and becomes a selectable past Event everywhere the Event filter appears.

**Blocked by:** 16 — Scorers and the Live Board use the Current Event from the server

**Status:** done (2026-09-18)

- [x] A Super Admin-only action creates a new Tournament with a name and court count
- [x] The new Tournament becomes the Current Event immediately, for every scorer and the Live Board
- [x] The previous Event's Matches and Games are unchanged and remain queryable by their own Event id
- [x] Admins and other roles cannot start a new Event
- [x] A test covers starting a second Event and confirms the first Event's data and Match count are unaffected

## Implementation (2026-09-18)

**Server (`api/db.php`, `api/tournaments.php`)**: `set_current_event_id(PDO $pdo, string $id): void` is the one writer for the Current Event id ticket 16 deliberately left unbuilt (upsert into `app_settings`). `start_new_event(PDO $pdo, ?array $currentUser, array $data): array` in `tournaments.php` is the new handler: checks the new `start_new_event` access-policy action (Super Admin only), requires a non-blank `name`, clamps `courts` via the existing `normalize_tournament_number()` (1-16, default 2), derives a fresh id from the name via `generate_event_id()` (slugified, with a numeric suffix if the slug collides), then reuses `save_tournament()` itself to create the row — a `schedule-update` save of a brand-new Tournament id with an empty `matches` array — before calling `set_current_event_id()`. Reusing `save_tournament()` means every existing validation, sanitization, and the tournament_matches upsert/delete bookkeeping applies for free; the new Event never touches the previous one's row or its `tournament_matches`, so past Matches and Games are untouched by construction, not by a special case.

New endpoint `api/start-event.php` mirrors `save-tournament.php`'s shape exactly (POST-only, JSON body, `user_from_request($pdo)`, `[status, payload]` tuple to `send_json`). `api/access_policy.php` gained `start_new_event` as a Super Admin-only action, alongside `manage_users`/`reset_tournament`/`clear_tournament_games`.

**Browser (`app.js`)**: a small `data-start-event-form` (name + court count, its own `state.startEventForm`) sits above the existing "Set up Tournament" configuration form in the Super Admin's Tournament workspace, so starting a fresh Event is visually distinct from editing the current one's schedule. `startNewEvent()` posts to `start-event.php` and, on success, sets `defaultTournament.id` and `state.tournament` directly from the response — the same mutation ticket 16's `hydrateAuth()` uses, so shared-store's fallback chain picks up the new Current Event immediately without a page reload.

**Known limitation (not fixed, flagged for follow-up):** `generate_event_id()`'s existence check and `save_tournament()`'s actual insert aren't atomic, and `start_new_event()`'s two writes (create Tournament, then set Current Event) aren't wrapped in one transaction. Two truly concurrent "start a new Event" calls with the same name could collide. Low risk in practice (a single Super Admin, a rare admin action, and the browser now guards against its own double-submit), not fixed here to keep the change proportionate — see the `/code-review` findings from this session for the exact scenarios.

## Verification (2026-09-18)

New test file `tests/start_event_test.php` (5 tests, red-then-green): a Super Admin starts a new Event and it becomes current; the previous Event's Matches and Match count are unaffected; only a Super Admin may start one (admin/player/visitor/signed-out all refused, Current Event unchanged); a blank name is refused; two Events with the same name get distinct ids. `tests/current_event_test.php` gained a test for `set_current_event_id()`. `tests/access_policy_test.php` updated for the new `start_new_event` action. Full 17-file PHP suite green; full JS suite green apart from the same 3 pre-existing, unrelated `tournament-records-tokens.test.js` failures noted in tickets 16's handoff.

Manually verified end-to-end in the browser (Herd, `http://paddlepoint.test`, a fabricated Super Admin session): typed "Fall Classic" / 4 courts into the new form and clicked Start New Event — `POST /api/start-event.php` returned the new `fall_classic` Tournament and `currentEventId`, the Tournament workspace immediately showed "Fall Classic" with 0 Matches/4 courts with no reload, and a direct DB check confirmed `open_play` still had its 11 Matches untouched and `current_event_id` now pointed at `fall_classic`. Reverted the database (`current_event_id` back to `open_play`, dropped the `fall_classic` row and the fabricated session) and cleared `localStorage` afterward.
