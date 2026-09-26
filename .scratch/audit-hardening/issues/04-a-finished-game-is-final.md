# 04 — A finished Game can't be rewritten, except by Correct Match (F10, part 1)

**What to build:** `save_game()` in `api/games.php` already refuses a Game id first saved by another account (409). The same account can still rewrite its own finished Game with a different result, e.g. the same Admin signed in on two devices, both ending the same Match. The last save wins and a result silently changes.

The browser calls `save-game.php` only once per Match, when it ends (`completeGame` → `saveCompletedGame` → `postSharedGame` in `app.js`). So a resave of a finished Game by its owner is a retry, and a retry carries the same result.

Rule: once a stored Game is finished (`winner_team` is `A` or `B`), a resave by its owner is accepted only when the winner and both scores match what is stored. Accept it as a no-op (200, same reply as today) so retries stay safe. A different result → 409 `This Match is already finished. A Super Admin can change the result with Correct Match.`. An unfinished stored Game (a Match saved while still in progress) can still be updated and finished. Correct Match (`correct_tournament_match()` in `api/tournaments.php`) stays the only way to change a finished result, and it doesn't go through `save_game`.

This is the "version" check the user approved, in its simplest form. A Rally-count check was rejected because Undo removes Rallies from the log, so the count legitimately goes down.

**Blocked by:** None — can start immediately.

**Status:** ready-for-agent

- [ ] Owner resaves a finished Game with the same winner and scores → 200, row unchanged
- [ ] Owner resaves a finished Game with a different winner or score → 409 with the message above; row unchanged
- [ ] A Game stored as in progress can still be finished by its owner
- [ ] The existing "another account" 409 and all of `tests/save_game_test.php` still pass
- [ ] If the browser shows the 409, it uses the server's message (`postSharedGame` already shows `serverRefusal` errors); confirm with a node test or the preview harness
