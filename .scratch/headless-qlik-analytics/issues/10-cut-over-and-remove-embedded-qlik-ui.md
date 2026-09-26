# 10: Cut over and remove embedded Qlik UI

**What to build:** Make the fully native Analytics view the only staff analytics experience and remove the superseded Qlik rendering path. Staff retain the Qlik Cloud handoff for deep exploration, but PaddlePoint no longer loads or displays any Qlik Sheet, app, chart, table, field or selection component.

**Blocked by:** 09: Cross-subject resilience and accessibility.

**Status:** ready-for-agent

- [ ] The native Analytics view is available through the normal staff navigation without a preview switch.
- [ ] Every `qlik-embed` element, embed script loader, Sheet configuration and Qlik-rendered fallback is removed from PaddlePoint.
- [ ] Obsolete embed-only styles, tests, test pages and theme integration are removed without deleting the server token flow or governed Qlik resources still used through QIX.
- [ ] The Admin Dashboard and all six Analytics subjects render only PaddlePoint-owned HTML, CSS and SVG.
- [ ] “Open in Qlik Cloud” remains available for authorized staff as the separate deep-exploration destination.
- [ ] Signed-out users, Players and Visitors remain unable to obtain analytics tokens or access the Analytics view.
- [ ] The full automated suite and visible-browser smoke test pass with no request for the Qlik embed library and no Qlik-rendered DOM component.
