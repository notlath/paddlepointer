# 07 — Match Date filter becomes a date range

**What to build:** The Match Date filter in Analytics becomes two native date inputs, From and To, that select the range of Match Dates in Qlik. Either end may be left empty for an open range. The active range appears in the removable selection chips from ticket 05. No charting library is added for this.

**Blocked by:** 05 — Event filter dropdown with removable selection chips

**Status:** ready-for-agent

- [ ] Setting From and/or To selects every Match Date in that range (inclusive) in Qlik
- [ ] A To date earlier than From is refused with a clear message and selects nothing
- [ ] The range shows as one removable chip; removing it clears both inputs and the selection
- [ ] The inputs reflect a Match Date selection made elsewhere
- [ ] Works at phone width
