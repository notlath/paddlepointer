# 13 — The app rebuilds the page at most once per frame

**What to build:** Every state change goes through one update step that schedules the page rebuild. An action that changes state several times rebuilds the page once, and a change no longer has to remember to call render itself.

Origin: architecture review candidate C12, rated Speculative. It pays off as typing and Live polling overlap more.

**Blocked by:** 12 — Toasts appear without rebuilding the app

**Status:** ready-for-agent

- [ ] An action that changes state several times (for example signing in, which also loads History, the Tournament and users) rebuilds the page at most once per frame, not once per change
- [ ] Direct render calls inside actions are replaced by the update step
- [ ] Nothing on screen goes stale: every view reflects the latest state once its action finishes
