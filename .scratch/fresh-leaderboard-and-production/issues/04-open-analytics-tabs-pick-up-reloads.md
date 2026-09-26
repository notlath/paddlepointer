# 04 — Open Analytics tabs pick up a finished reload

**What to build:** Staff who leave the Analytics view open during an Event see new data without refreshing the page. The "Last reloaded" label becomes a live "Updated Xs ago" that keeps itself current instead of being fetched once per page load. When a reload finishes, the charts update in place and the user's selections are kept. First establish the fact: does the Qlik engine push reloaded data to an already-open session? If it does, only the label and a re-draw are needed. If it does not, the view reopens its session after a reload and reapplies the selections.

**Blocked by:** None — can start immediately.

**Status:** ready-for-agent

- [ ] Finding recorded (in the commit message): whether an open engine session sees reloaded data without reconnecting
- [ ] The freshness label keeps updating while the view is open and reflects a new reload within about a minute of it finishing
- [ ] After a reload, charts on the open tab show the new data without a page refresh
- [ ] Selections made before the reload are still applied after it
- [ ] A hidden or backgrounded tab does not keep checking at full rate (checks pause while the page is hidden)
- [ ] Verified against the dev tenant with a real reload
