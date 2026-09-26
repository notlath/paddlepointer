# 04 — Make Match Setup choices accessible

**What to build:** A user can configure game type, first server, target score, and win-by-two using a keyboard or screen reader with the same confidence as a pointer user. Selected and disabled states are communicated programmatically as well as visually.

Origin: UI/UX audit finding U-04, limited to Match Setup controls.

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

- [ ] Game type, first server, and target score expose a single selected option per group
- [ ] Every option group has an accessible name and each option has an accessible selected state
- [ ] Arrow keys and Tab follow the expected interaction model for the chosen native or ARIA control pattern
- [ ] Win-by-two exposes its checked state and can be toggled with Space
- [ ] The disabled scoring type is announced as unavailable and remains visually distinct
- [ ] Keyboard changes continue to update the setup preview and persisted setup state
- [ ] Visible focus is retained for every setup control
