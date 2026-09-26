# 02 — Require valid player identities before starting a Match

**What to build:** A Visitor or Super Admin cannot start a standalone Match until every required player has a meaningful, unique name. The signed-in Visitor's name can be reused where appropriate, and placeholder labels never enter History or Leaderboards as real players.

Origin: UI/UX audit finding U-06.

**Blocked by:** P0-04 — Make Match Setup choices accessible

**Status:** completed

- [x] Singles requires one nonblank player name for each team
- [x] Doubles requires two nonblank player names for each team
- [x] Names that differ only by surrounding whitespace or letter case are treated as duplicates
- [x] Missing and duplicate names show contextual errors and focus the first invalid field
- [x] A signed-in Visitor's known display name is prefilled where doing so does not overwrite entered data
- [x] Placeholder labels are used only as input hints and are never saved as player identities
- [x] Valid Matches continue to save correct players to History and Leaderboards
