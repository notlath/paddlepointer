# 17 — Migrate Tournament, records, and people styles to semantic tokens

**What to build:** Tournament (Open Play setup, format estimate, Schedule, Rounds, Tournament Matches, player access), Dashboard, People and Profile, History, Leaderboard, Rules, toasts, and refresh feedback use only semantic tokens for color, surface, border, state, and shadow.

Origin: UI polish audit finding M5. Migrate batch 4 of 4.

**Blocked by:** 16 — Migrate Live Board and TV mode styles to semantic tokens

**Status:** done

- [x] Remaining styles reference semantic tokens instead of original brand variables or raw colors
- [x] Missing roles get named semantic tokens rather than staying literals
- [x] A search of the stylesheet finds no remaining references to the original brand variables outside the token definitions, and no raw colors outside the token definitions
- [x] There is no intended visual change: Dashboard, Tournament in each progressive step, People, Profile, History, Leaderboard, Rules, toasts, and refresh states look identical before and after on desktop and mobile
- [x] The existing automated test suite remains green
