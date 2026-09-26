# 04 — Preserve authenticated views in the browser URL

**What to build:** Authenticated users can refresh, bookmark, and use Back or Forward on permitted views such as Dashboard, Live, History, Leaderboard, Tournament, Profile, and Rules. Invalid or unauthorized destinations fall back safely to the role's home view.

Origin: UI/UX audit finding U-08.

**Blocked by:** P0-09 — Restore context after in-app navigation

**Status:** completed

- [x] Every authenticated navigation destination has a stable URL representation
- [x] Refreshing a permitted URL restores the same view after session hydration
- [x] Back and Forward move through previously visited views without logging the user out or duplicating history entries
- [x] Opening a bookmarked permitted view lands on that view after authentication
- [x] Unauthorized, unknown, or malformed view values fall back to the signed-in role's home view with clear feedback
- [x] Player and Visitor role restrictions remain enforced independently of the URL
- [x] Existing Player and Visitor portal query links continue to work
