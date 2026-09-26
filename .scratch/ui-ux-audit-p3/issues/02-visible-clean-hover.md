# 02 — Give buttons a visible, clean hover

**What to build:** Pointer users see a clear, calm hover response on every button type (primary, dark, green, warn, danger, ghost, rally, segment, table action, and navigation). Today hover adds a 45% lime outline that is effectively invisible on white (about 1.1:1) and a brightness filter that muddies lime and orange fills.

Origin: UI polish audit finding H3.

**Blocked by:** None (can start immediately)

**Status:** completed

- [x] Each button variant has one intentional hover treatment: a slightly deeper or lighter fill, or a border or background shift for ghost buttons
- [x] The global hover outline and brightness filter are removed
- [x] Hover is visibly different from the resting state on both light pages and navy surfaces
- [x] Hover and keyboard focus-visible remain distinct; focus rings are unchanged and never removed
- [x] Hover transitions animate only color, background, border, or shadow, within the shared fast motion duration, and are instant under reduced motion
- [x] Disabled buttons show no hover change
- [x] Touch devices do not show a sticky hover state after tapping
- [x] Pressed feedback (the 0.96 scale) still works and does not shift surrounding layout
- [x] A focused visual check covers every button variant at rest, hover, focus-visible, pressed, and disabled
