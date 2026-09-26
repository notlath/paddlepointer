# 10 — Make the mobile scoreboard safe for live scoring

**What to build:** On a phone, a scorer can immediately identify both teams, the score, the serving team and player, and the two rally actions without reading tiny text or risking an adjacent destructive action. Secondary match details and controls remain reachable without forcing all content into one fixed viewport.

Origin: UI/UX audit finding U-02.

**Blocked by:** 01 — Establish an accessible visual baseline

**Status:** complete

- [x] Team names, scores, serving state, and both rally actions remain visible and legible at 320px and 375px widths
- [x] Rally actions and other frequently used controls have at least 44 by 44 CSS pixel targets with adequate separation
- [x] Serve position and current server can be verified without reading text smaller than the accessible visual baseline
- [x] Undo, End, and Reset remain reachable but are visually separated from rally scoring actions
- [x] Secondary metadata can scroll or expand instead of being silently removed to fit the viewport
- [x] Portrait and landscape layouts do not clip content or trap the scorer in a non-scrollable region
- [x] Long player and team names truncate or wrap without covering scores or controls
- [x] Existing rally, undo, match-end, and recovery behavior remains unchanged
