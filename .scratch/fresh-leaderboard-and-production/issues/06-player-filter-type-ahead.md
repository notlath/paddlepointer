# 06 — Player filter becomes a type-ahead

**What to build:** The Player filter in Analytics becomes a searchable type-ahead. Typing searches Player names in Qlik and lists matches; choosing one selects that Player. It replaces the chip list, which grows into a wall of buttons and silently drops every Player past the 200th. The selected Player appears in the removable selection chips from ticket 05.

**Blocked by:** 05 — Event filter dropdown with removable selection chips

**Status:** ready-for-agent

- [ ] Typing a partial name lists matching Players from Qlik, however many Players exist
- [ ] Choosing a result selects that Player; its chip appears in the selections bar and can be removed there
- [ ] Keyboard use works end to end: type, arrow through results, Enter to select, Escape to close
- [ ] Players excluded by other selections are shown as excluded or omitted, consistently with the other filters
- [ ] A no-match state is shown when nothing matches
