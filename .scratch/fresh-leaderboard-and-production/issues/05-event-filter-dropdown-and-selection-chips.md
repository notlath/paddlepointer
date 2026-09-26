# 05 — Event filter dropdown with removable selection chips

**What to build:** In the Analytics view, the Event filter becomes a single-choice dropdown instead of a row of chips: "All Events" first, then a "Current Event" shortcut labelled with its name, then every other Event. Analytics still opens on All Events (ADR 0002); the shortcut makes lining Analytics up with the app Leaderboard one click. Active selections, from any filter and carried across subjects, are shown as chips that can each be removed, replacing the current "Filtered by…" text line. "Clear selections" stays.

**Blocked by:** None — can start immediately.

**Status:** ready-for-agent

- [ ] The Event filter is a native dropdown with All Events first and the Current Event shortcut second
- [ ] Choosing an Event selects it in Qlik; choosing All Events clears the Event selection
- [ ] The dropdown reflects selections made elsewhere (another subject, or a chip removal)
- [ ] Every active selection shows as a chip naming the field and value; removing a chip clears just that field's selection
- [ ] The selections summary is still announced to assistive tech, and the dropdown has a visible label
- [ ] Works at phone width without horizontal scroll
