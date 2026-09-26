# 07 — A Player can't be in two live Matches at once

**What to build:** Starting a Tournament Match is refused while any of its Players is in another in-progress Tournament Match. The refusal names the busy Player and their court. The server enforces this; the app shows the same reason and dims Start Match for that Match.

Origin: pickleball rules review (queue finding: no check that a Player is free).

**Blocked by:** None — can start immediately

**Status:** complete

- [x] The server refuses to move a Tournament Match to in-progress if any of its Players is in another in-progress Tournament Match
- [x] The refusal names the busy Player and the court they are on
- [x] Start Match is unavailable, with that reason, for Matches whose Players are busy
- [x] Taking over or resuming the same Match is not blocked by its own Players
- [x] PHP tests cover a refused start and an allowed start after the other Match completes
