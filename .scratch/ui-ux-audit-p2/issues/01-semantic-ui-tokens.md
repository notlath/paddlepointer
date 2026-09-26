# 01 — Expand the stylesheet with semantic UI tokens

**What to build:** PaddlePoint keeps its current navy, lime, court-green, orange, red, and neutral identity while shared surfaces and interaction states gain one documented semantic vocabulary. This is the expand step that lets later stylesheet migrations happen without changing every screen at once.

Origin: UI/UX audit findings DS-03 and DS-06.

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

- [ ] Semantic tokens cover page, panel, elevated, navigation, input, overlay, and court surfaces
- [ ] Semantic tokens cover primary, warning, destructive, success, selected, disabled, hover, pressed, and focus-visible states
- [ ] Type, spacing, radius, elevation, control-height, icon-size, motion-duration, and layer values use a small named scale
- [ ] Existing brand colors retain their current meanings and accessible foreground pairings
- [ ] Existing selectors can continue using their current values while migrations are in progress
- [ ] Introducing the token layer produces no intended visual or behavioral change
- [ ] A focused visual check covers sign-in, Dashboard, Match Setup, Scoreboard, Live, Tournament, History, and Leaderboard
