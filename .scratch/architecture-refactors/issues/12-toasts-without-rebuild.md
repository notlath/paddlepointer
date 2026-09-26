# 12 — Toasts appear without rebuilding the app

**What to build:** A toast message appears and disappears without rebuilding the rest of the page. Today each toast rebuilds the whole app twice (once to show, once to hide), so someone typing in a field loses their place.

Origin: architecture review candidate C12.

**Blocked by:** None — can start immediately

**Status:** ready-for-agent

- [ ] Showing and hiding a toast leaves every other part of the page untouched
- [ ] Typing in any text field while a toast appears and disappears keeps focus, cursor position and the typed text
- [ ] Toasts are still announced to screen readers and still disappear after the same delay
