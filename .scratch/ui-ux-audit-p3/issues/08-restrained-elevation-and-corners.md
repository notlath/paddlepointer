# 08 — Restrained elevation and consistent corners

**What to build:** Depth means something again. Only content that floats or is currently important looks lifted, and corners follow one radius system. Today the largest shadow is applied to routine panels, score tiles, and Live court cards alike, so nothing stands out. Radii are mostly 8px but include stray 6px, 7px, and 14px values, and nested rounded surfaces do not account for their padding.

Origin: UI polish audit findings M6 and M10. Builds on the hierarchy decisions from P2-06 and P2-07.

**Blocked by:** None (can start immediately)

**Status:** completed

- [x] The strongest elevation is reserved for dialogs, toasts, the mobile drawer, and the current or active Match surface
- [x] Routine panels, forms, and record lists use a flat surface with a subtle border or ring
- [x] Shadows are tinted to navy (no pure black shadows on light pages) and come from the existing elevation scale
- [x] Every radius comes from the named radius scale; stray one-off radii are removed
- [x] Where a rounded surface sits inside another with a visible, even inset of 24px or less, the outer radius equals the inner radius plus the inset
- [x] Score tiles, the court board, and Live court cards remain visually prominent against their surroundings
- [x] Focus rings are not clipped by any surface after shadow or radius changes
- [x] A focused visual check covers Dashboard, Match Setup, Scoreboard, Live Board, Tournament, History, Leaderboard, and dialogs

Implementation notes:
- Strongest elevation: dialogs, toasts, open mobile drawer, skip link, home court card, and the Scoreboard score tiles and court board (the Match being scored).
- Medium elevation keeps Live court cards, the final result card, the current round, and the in-progress Dashboard card prominent without floating.
- Light elevation: selected segment, switch knob, sticky top bar. Routine panels, sign-in cards, setup preview, desktop rail, and top-bar controls are flat.
- Segment and Live Board tab containers use 4px padding so an 8px container holds 4px tabs concentrically. The court drawing uses the small radius as an independent surface.

Visual check (2026-09-15): rendered the real Live Board templates at 1366×768, 1440×900, 1920×1080, 1024×768, and 375×812, and measured computed shadow and radius for every surface this ticket names (panel, hero panel, sign-in cards, setup preview, score tiles including serving, court board, result card, recovery and destructive dialogs, toast, segments, Live Board tabs, Live court cards, in-progress Dashboard card, current round card). Every surface resolved to its intended elevation token and radius; segment and tab corners are concentric (8px container, 4px padding, 4px inner). Signed-in Dashboard, Tournament, and History screens were checked through their shared surface classes rather than full-page sessions.

Follow-up found during the check: the Live Board viewport lock hid half the courts on laptop screens. That was fixed separately as a Live Board layout change.
