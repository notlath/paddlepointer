# 06: Player Performance subject

**What to build:** Recreate Player Performance in the native Analytics preview with a clear Win % hero, supporting context, a performance trend and native partner/opponent details. Staff can select a Player and follow the result across every component through the shared associative session.

**Blocked by:** 02: Native analytics session and selection shell.

**Status:** ready-for-agent

- [ ] Win % is the hero KPI and its Matches denominator is visible alongside it.
- [ ] Redundant Points For, Points Against and per-Match margin presentations are not recreated when the detail data already answers those questions.
- [ ] Win % Over Time remains as a distinct trend rather than being removed as a duplicate of the aggregate KPI.
- [ ] Partner Performance and Opponent Results use one native tabbed detail region with bounded QIX pages.
- [ ] Player, Event and other relevant selections update every mounted component without reopening the app session.
- [ ] One runnable automated check covers KPI mapping, denominator visibility and detail-tab paging.
