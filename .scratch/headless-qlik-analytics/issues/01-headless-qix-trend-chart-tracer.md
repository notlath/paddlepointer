# 01: Headless QIX trend-chart tracer

**What to build:** Replace the Admin Dashboard's embedded Matches Over Time chart with a PaddlePoint-rendered SVG chart whose data comes from the existing governed Qlik object through one direct QIX session. This is the tracer bullet for the headless architecture: staff authenticate through the existing Event Viewer flow, see the same analytical result without any Qlik-rendered UI, and get an actionable retry state if the analytics layer is unavailable.

**Blocked by:** None (can start immediately).

**Status:** ready-for-agent

- [ ] The Admin Dashboard contains no Qlik-rendered chart; PaddlePoint owns its markup, SVG, styles, labels and interaction states.
- [ ] The browser obtains the existing staff-gated short-lived token and opens a QIX app session through `@qlik/api`; signed-out and non-staff users cannot open it.
- [x] The chart reads a session object built from the Matches master measure and Match Date master dimension, so no expression is duplicated (amended 2026-09-21).
- [ ] Only the data page needed by the chart is requested, and the session is closed when no longer needed.
- [x] ~~D3 is pinned…~~ Dropped 2026-09-21: charts are hand-drawn SVG; ADR 0004 makes D3 optional.
- [ ] Loading, empty, upstream-failure and retry states are visible and accessible.
- [ ] One runnable automated check covers the data-to-chart mapping, and the real chart is verified at desktop and phone widths.
