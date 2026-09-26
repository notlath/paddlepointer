# 02: Native analytics session and selection shell

**What to build:** Add a staff-only preview of the native Analytics view that owns its navigation and selection experience while sharing one QIX app session across all Analytics subjects. Staff can see current selections, clear them, move backward and forward through selection history, and switch subjects without losing state; separate browser tabs do not leak selections to each other.

**Blocked by:** 01: Headless QIX trend-chart tracer.

**Status:** ready-for-agent

- [ ] The preview uses the tracer's token, connection and cleanup path instead of opening a second analytics runtime.
- [ ] One explicit identity is shared within a browser tab and differs between tabs.
- [ ] Native controls display current selections and provide clear, back and forward actions through QIX.
- [ ] A native field filter exposes selected, possible, alternative and excluded values with understandable visual and screen-reader states.
- [ ] Changing Analytics subjects preserves the tab's associative selection state.
- [ ] Only the active subject mounts data objects; inactive subject objects are released without closing the shared session.
- [ ] Loading, expired-token, disconnected-session and retry behavior are exercised by one runnable automated check.
