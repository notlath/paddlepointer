# 09 — Restore context after in-app navigation

**What to build:** Keyboard and screen-reader users can bypass repeated navigation and receive a clear announcement when an authenticated view changes. Moving between Dashboard, Live, History, Leaderboard, Tournament, Profile, and Rules does not leave focus on a removed control or at the document root.

Origin: UI/UX audit finding U-04, limited to navigation focus.

**Blocked by:** None (can start immediately)

**Status:** complete

- [x] A visible-on-focus skip link moves focus to the main content area
- [x] The main content region has a stable accessible target and label
- [x] Changing views moves focus to the new page heading or main region after rendering
- [x] The new view title is announced without requiring the user to traverse navigation again
- [x] Closing mobile navigation before a view change does not lose the destination focus
- [x] Pointer users do not receive an unexpected visible focus jump during normal navigation
