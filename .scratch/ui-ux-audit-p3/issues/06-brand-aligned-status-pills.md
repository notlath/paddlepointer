# 06 — Brand-aligned status pills

**What to build:** Dashboard status pills (Scoring, Ongoing, Scheduled, Completed, Idle, None, and the court and progress counts) use PaddlePoint's own palette so they feel part of the product. Today they use four stock colors (pale green, sky blue, pale yellow, slate) that appear nowhere else in the brand.

Origin: UI polish audit finding M3.

**Blocked by:** None (can start immediately)

**Status:** completed

- [x] Active states (Scoring, Ongoing, Live) use a court-green treatment
- [x] Scheduled uses a navy-tinted treatment
- [x] Completed uses a lime-tinted treatment consistent with finished Matches on the Live Board
- [x] Idle and None use a neutral treatment
- [x] Each pill carries its meaning in its label, and active states add a shape or icon cue so meaning does not depend on color alone
- [x] All pill text meets 4.5:1 contrast against its pill background
- [x] Pill colors resolve through semantic status tokens, not raw color literals
- [x] The same status looks the same wherever it appears (Dashboard lead cards, Tournament schedule, Live Board)
- [x] A focused visual check covers every Dashboard lead card in each of its states
