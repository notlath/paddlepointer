# 04 — Reduce the type system to a small scale

**What to build:** Text across PaddlePoint follows one small, named type system so headings, labels, and numbers feel like one product. Today the stylesheet uses ten weights (400, 500, 600, 650, 700, 750, 800, 850, 900, 950) and about fifty distinct font sizes, around thirty of them one-off fluid values.

Weight decision: four weights. Regular 400 for body, SemiBold 600 for labels and secondary emphasis, Bold 700 for headings and buttons, and ExtraBold 800 (the logo weight) for display headings, score digits, and the score call.

Origin: UI polish audit finding M4.

**Blocked by:** 03 — Load Inter as the application typeface

**Status:** completed

- [x] Only the four agreed weights are used; every other weight value is mapped to its nearest role
- [x] Weight tokens are renamed or re-pointed so no token promises a weight Inter will not render (no 850 or 950)
- [x] A named size scale covers caption, label, body, lead, section heading, page heading, and display; one-off rem sizes map onto it
- [x] Task-specific display sizes are kept as a small named set for Scoreboard digits, the score call, Live Board court counts, and TV mode, rather than being flattened into the general scale
- [x] Body text stays at least 16px and secondary text at least 14px, matching the existing authenticated typography baseline
- [x] Line heights come from a small set (tight for display and digits, normal for headings, relaxed for body)
- [x] Mobile Scoreboard and TV-mode Live Board keep their viewing-distance legibility at 375px, 768px, 1280px, and a 1920px TV width
- [x] An automated stylesheet check fails if a weight outside the four agreed values is introduced

