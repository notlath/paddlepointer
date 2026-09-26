# 08 — Make Live Board tabs keyboard operable

**What to build:** Users can switch between Ongoing Match and Next Match using standard tab keyboard behavior, while screen readers can identify the active tab and its associated content.

Origin: UI/UX audit finding U-04, limited to the Live Board tabs.

**Blocked by:** None (can start immediately)

**Status:** complete

- [x] Each tab has an accessible name, selected state, and relationship to its tab panel
- [x] Only the active tab is in the normal Tab sequence
- [x] Left and Right Arrow move between tabs and activate the corresponding panel
- [x] Home and End move to the first and last tab respectively
- [x] Focus remains on the selected tab while Live data refreshes
- [x] Pointer interaction and the current Ongoing/Next content behavior remain unchanged
