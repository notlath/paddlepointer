# 13 — App copy cleanup

**What to build:** Visible copy across authenticated views is plain, consistent, and free of decorative punctuation. Page headers state what the page is once. Today a few strings use em dashes (for example the failed court refresh message and the completed and future Round summaries), freshness text is prefixed with a "•" bullet, and most of the 22 page headers carry a small uppercase eyebrow that repeats the heading beneath it (for example "Leaderboard" above "Standings").

Origin: UI polish audit low-priority items. Sign-in copy is handled by ticket 07.

**Blocked by:** None (can start immediately)

**Status:** completed

- [x] No visible string uses an em dash or en dash as a separator; sentences are restructured or use a colon, comma, or period, and number ranges use a hyphen
- [x] Freshness text reads naturally without a bullet separator
- [x] Page-header eyebrows are kept only where they add information not in the heading (such as a role or Tournament name) and removed where they repeat it
- [x] Removing an eyebrow does not remove the page's accessible heading or change landmark structure
- [x] Wording follows the canonical product vocabulary: Match, Tournament, Open Play, Schedule, Round, Tournament Match, Live Board, Scoreboard, Rally, Team, and Score
- [x] Toasts, empty states, errors, and confirmations keep an action's name consistent before and after it completes
- [x] The existing product vocabulary test passes, and it is extended to fail on visible em dashes
