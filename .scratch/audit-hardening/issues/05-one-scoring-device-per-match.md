# 05 — Only the device that holds the Scoreboard can change a Tournament Match (F10, part 2)

**What to build:** While a Tournament Match is played, the Scoreboard sends `score-sync` updates to `save-tournament-match.php` (`update_tournament_match()` → `transition_match()` in `api/match_lifecycle.php`). The server locks an in-progress Match to its `activeGameId`. But **Take Over Scoring** (`takeOverTournamentMatch` in `app.js`) deliberately reuses the Match's `activeGameId`, so the server can't tell the new device from the old one. The old device, e.g. a tablet waking up or a second tab, can keep sending older scores, and even complete the Match, over the new device's scores. This is the real "stale device overwrites newer state" case behind F10.

Approach (the version-style check the user approved): a **scoring claim** per in-progress Match.
- On `start-match` (including a take-over), the server makes a random claim (`bin2hex(random_bytes(8))`). It stores the claim with the Match (in `match_json`, so no migration is needed) and returns it in the update reply.
- A take-over replaces the claim, which retires the old device.
- The browser keeps the claim on the active Game (it survives a refresh through the stored active Game). It sends the claim with every `score-sync`, `complete-match` and `unlock-match` for that Match.
- The server refuses an update whose claim doesn't match the stored one with 409 `Scoring moved to another device`.
- A Match with no stored claim (started before this ships) accepts updates as today until its next start or take-over.
- The claim is never shown on the Live Board or in `read_tournament` output to non-staff. Staff reads may include it; it grants nothing without a staff session.
- The old device, on that 409, stops syncing, shows a toast ("Scoring moved to another device"), and leaves the Scoreboard for the Tournament view. The Match continues on the new device. The old device's local copy is dropped; the new device's scores stand.
- Super Admin Correct Match and schedule edits are unaffected.

**Blocked by:** None — can start immediately.

**Status:** ready-for-agent

- [ ] `start-match` returns a claim; `score-sync`/`complete-match`/`unlock-match` with that claim succeed
- [ ] After a take-over, updates with the old claim are refused 409 and change nothing; the new claim works
- [ ] A Match stored without a claim still accepts updates (old in-progress Matches keep working)
- [ ] The claim survives a Scoreboard refresh on the device that holds it
- [ ] The old device, on 409, stops syncing, shows the toast and leaves the Scoreboard
- [ ] `tests/tournament_match_test.php` covers the server rules; a node test covers the client's claim handling
- [ ] Two-device check by hand (two browser profiles): start on A, take over on B, score on A → A is bounced, B's score stands
