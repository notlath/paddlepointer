---
status: accepted
---

# Qlik is a headless analytics layer

PaddlePoint owns the entire visible analytics interface in native HTML, CSS and JavaScript. Qlik Cloud retains the data model, governed dimensions and measures, saved-object hypercubes, calculations and associative selection state, but no Qlik Sheet, app, chart, table, field or selection component is embedded. The browser opens one QIX app session through `@qlik/api`, authenticated by the existing staff-only shared Event Viewer impersonation flow, and requests bounded hypercube pages for native KPI cards, accessible HTML tables, filters and custom SVG charts. Existing published objects supply data definitions when their hypercubes fit; session objects supply UI-specific shapes without copying business expressions into JavaScript. D3 may provide low-level scale, axis, shape and interaction primitives, but PaddlePoint owns the resulting SVG and semantics.

## Consequences

- All six Analytics subjects move together in one user-facing cutover, while implementation and verification proceed component by component behind the existing view.
- One browser-tab session carries selections across subjects; separate tabs remain isolated. Native controls expose selected, alternative and excluded values plus clear, back and forward actions.
- Detailed data is paged rather than exported wholesale to the browser. Only the active subject's objects are mounted.
- Capability APIs, `qlik-embed`, Nebula.js and enigma.js are not part of the custom frontend. Qlik Cloud remains a separate destination for deep exploration.
- PaddlePoint now owns visualization rendering, accessibility, responsive behavior, loading and failure states. A failed analytics session leaves the native shell usable and offers retry plus the Qlik Cloud handoff.

## Considered options

- Whole-Sheet embedding was rejected because Qlik owns the layout and visible interaction model.
- Individual `qlik-embed` charts were rejected because they still bring Qlik-rendered UI into the product.
- Reimplementing calculations outside Qlik was rejected because it would duplicate governed analytics logic and weaken associative behavior.
