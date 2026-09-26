# 05 — Use one product vocabulary across every role

**What to build:** Admins, players, and visitors encounter the same names for the same concepts and actions. A scored contest is called a Match, Open Play names the event format, Schedule names generated rounds and court assignments, Live Board names the spectator view, and Scoreboard names scorer controls.

Origin: UI/UX audit finding DS-04.

**Blocked by:** None (can start immediately)

**Status:** completed

- [x] Navigation, headings, buttons, helper text, empty states, confirmation text, errors, and success messages use the canonical terms consistently
- [x] Start Match, Match started, Resume Match, End Match, and Match saved remain the action and feedback progression
- [x] “Game” is removed from visible interface copy unless a documented pickleball rule genuinely distinguishes it from a Match
- [x] Open Play, Tournament, Schedule, Round, Live Board, and Scoreboard each have one non-overlapping meaning
- [x] The same action keeps the same label before, during, and after completion
- [x] Role-specific wording changes only the user's authority or perspective, not the domain term
- [x] Existing stored data, API field names, permissions, and URLs are not renamed as part of this copy ticket

Note: PHP API error strings ("Game not found", "Game id required", "Active game id is required") are asserted by the PHP API tests and were left for a server-side follow-up.
