# 12 — Numeric and layout finishing details

**What to build:** Numbers line up, headings wrap evenly, icons share one visual weight, and the TV board fits tablets used as displays. Today tabular numbers apply only to the large Score digits, headings and intros break unevenly, navigation and interface icons mix stroke weights from 1.8 to 2.2, and TV mode sizes itself to the classic viewport height.

Origin: UI polish audit low-priority items.

**Blocked by:** 04 — Reduce the type system to a small scale

**Status:** completed

- [x] Leaderboard rank, wins, win rate, and point differential columns use tabular numbers and align consistently
- [x] Round numbers, court numbers, Tournament progress counts (such as "3/12 Done"), timers, and freshness times use tabular numbers
- [x] Page headings, dialog titles, and short intro paragraphs use balanced wrapping; long body copy keeps normal wrapping
- [x] All interface icons use one stroke weight matched to the adjacent label weight and inherit the current text color
- [x] TV-mode Live Board uses dynamic viewport height so it fits tablets and browsers with changing toolbars without cropping
- [x] No column widths or row heights shift when numbers update
- [x] A focused visual check covers Leaderboard (desktop and 375px), Tournament schedule, Dashboard lead cards, and TV mode at a 1920px width and on a tablet emulation
