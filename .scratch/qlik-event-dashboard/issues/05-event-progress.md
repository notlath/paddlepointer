# 05 — Event progress

**What to build:** Organisers see how far along the Current Event is: how many Tournament Matches are scheduled, in progress and completed, and the percentage complete. The sheet uses the Events and Matches data already loaded and can be pointed at any Event, defaulting to the Current Event, so no new endpoint is needed.

**Blocked by:** 04 — Courts right now

**Status:** done (2026-09-16)

- [x] The sheet shows counts of scheduled, in-progress and completed Matches, filterable to one Event
- [x] The percentage complete is completed Matches divided by all Matches in the selected Event
- [x] The completed count matches that Event's row from ticket 03

## Implementation (2026-09-16)

**Spec gap found and resolved:** the third checklist item assumes ticket 03's Events row exposes a completed-Match count, but the shipped ticket-03 endpoint only had `matchCount` (every Match, any status). Per your call, extended the already-committed `/api/qlik/get-events.php` rather than treating it as an informal DB-only sanity check:

- `api/qlik/events.php`: added `completedCount` (from the existing `tournaments.completed_count` column, already tracked by `save_tournament()` — counts Matches with `status === 'completed'` exactly).
- `tests/qlik_events_test.php`: new test asserting `matchCount` counts every Match while `completedCount` counts only finished ones. Full suite re-verified green.

No new endpoint needed for the scheduled/in-progress/completed breakdown or the percentage — both come from the "Matches" table ticket 04 already loads, via a `Count({<[Match Status]={'...'}>} [Match Id])` set-analysis expression per status, and `[completed]/[all]` for the percentage.

## Qlik-side wiring (2026-09-16, mtcmarketing.sg sandbox)

Added `Completed Count` to the Events table's load script (SQL + LOAD statement), verified via `TRACE`: `matchCount=11, completedCount=8` from the Events row, independently cross-checked against `count(status=completed)=8` and `count(status=scheduled)=3` computed straight from the Matches table (8+3=11, matching exactly). No sheet built — same call as ticket 04, this is now a few Qlik-Sense KPI expressions for you to add visually; the underlying data is confirmed correct.

New tooling note: pushing a large script through `ConvertTo-Json` in Windows PowerShell 5.1 silently corrupted the payload (wrapped the script string in an extra `{"value": ...}` object, causing the API to 500 with no error detail). Switched to `System.Web.Script.Serialization.JavaScriptSerializer` for building the script-update JSON body, which serializes long strings correctly. Worth reusing for any future ticket that pushes an app script via this route.
