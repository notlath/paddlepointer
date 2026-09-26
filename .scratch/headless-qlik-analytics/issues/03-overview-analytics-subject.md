# 03: Overview Analytics subject

**What to build:** Recreate the Overview subject inside the native Analytics preview with PaddlePoint KPI cards, filters, custom charts and accessible detail tables backed by Qlik-governed hypercubes. It should answer the same Overview questions without embedding its Qlik Sheet or copying analytical expressions into JavaScript.

**Blocked by:** 02: Native analytics session and selection shell.

**Status:** ready-for-agent

- [ ] The subject includes the approved hero KPI hierarchy, supporting KPIs, Matches Over Time trend, win-rate distribution and required detail tables.
- [x] Data comes from session objects built from master dimensions and measures (amended 2026-09-21: the published objects are starved, and ADR 0004 allows session objects).
- [ ] Filters and chart interactions update every mounted Overview component through the shared associative session.
- [ ] Tables use bounded pages and expose sorting or pagination without loading their complete result sets.
- [ ] Charts provide text summaries or equivalent accessible data, keyboard-reachable interactions and responsive layouts.
- [ ] One runnable automated check covers Overview data mapping and selection-driven updates.
