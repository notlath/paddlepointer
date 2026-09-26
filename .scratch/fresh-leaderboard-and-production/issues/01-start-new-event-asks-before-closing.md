# 01 — Start New Event asks before closing the Current Event

**What to build:** A Super Admin who presses Start New Event sees a confirmation dialog before anything happens, because starting a new Event cannot be undone: the Current Event becomes a past Event, read-only and never current again (CONTEXT.md, Current Event). The dialog names both Events, e.g. "Start 'Fall Classic'? 'Summer Open' becomes a past Event and can't be scored or reopened. This can't be undone." When the Current Event still has unfinished Tournament Matches it adds one line with counts, e.g. "2 Matches in progress and 6 not played will stay unfinished in 'Summer Open'." Cancel is focused by default and leaves everything as it was. Reuse the app's existing confirmation dialog; the server-side Start New Event behaviour does not change. Nothing is deleted (ADR 0002 stands).

**Blocked by:** None — can start immediately.

**Status:** ready-for-agent

- [ ] Pressing Start New Event opens a confirmation dialog instead of starting the Event
- [ ] The dialog names the new Event and the Current Event being closed, and says it cannot be undone
- [ ] When the Current Event has in-progress or not-played Tournament Matches, the dialog states both counts; when it has none, the line is absent
- [ ] Cancel is focused on open; Cancel or Escape starts nothing and keeps the form's entered name and courts
- [ ] Confirming starts the Event exactly as before (same request, same success and failure feedback)
- [ ] Only a Super Admin can reach the dialog
