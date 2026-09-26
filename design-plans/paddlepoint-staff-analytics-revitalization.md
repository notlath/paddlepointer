# PaddlePoint staff analytics revitalization

Written against: `09e33b41024a35939b07663283eae5cb6d737e9e` plus the current dirty analytics worktree

## Design language

- Audited surface: the Staff Dashboard analytics summary and the six subjects in the staff-only Analytics view (`/?view=home` and `/?view=analytics`).
- Product task: venue staff should understand event performance at a glance, narrow the data quickly, and open Qlik Cloud only for deeper exploration.
- Design sources: `CONTEXT.md`; `DESIGN.md` for brand tokens and motion restraint only (its scope is auth); `styles.css:1-245`; `app.js:1294-1405`; `qlik-mashup.js:49-510`; `qlik-mashup.css:1-105`; `docs/adr/0004-qlik-is-a-headless-analytics-layer.md`; `docs/qlik-sheet-design.md`; `tests/semantic-ui-tokens.test.js`; `tests/restrained-elevation.test.js`.
- Documented decisions: PaddlePoint owns the visible analytics UI; Qlik remains the calculation and selection layer; signed-in screens use Inter; routine panels stay flat; all shared colors, radii, spacing, motion, and elevation resolve through the existing semantic tokens; at most four KPIs appear in one band and one is dominant.
- Governing owners and consumers: `app.js` owns the Dashboard/Analytics composition and product copy; `qlik-mashup.js` owns native analytics markup and data shapes; `qlik-mashup.css` owns analytics presentation; `styles.css` owns shared tokens and shell components.
- Explicit exceptions: `DESIGN.md`'s Geist typography and auth-only layout do not govern signed-in screens. Qlik Cloud keeps its separate native interface after the handoff link.
- Rendered evidence: the sign-in shell was verified at 1280×720. The staff-only dashboard could not be rendered without a valid local staff session, so hierarchy findings below rely on deterministic markup/style composition and must be visually verified before acceptance.

## Findings

| # | Problem | Evidence | Proposed change | Scope | Confidence |
| --- | --- | --- | --- | --- | --- |
| 1 | The Dashboard analytics card renders “Matches Over Time” twice. | `app.js:1327-1337` supplies the card heading; `qlik-mashup.js:55-57` gives the dashboard chart the same title; `card()` at `qlik-mashup.js:303-304` renders every non-`bare` title. `docs/qlik-sheet-design.md` explicitly says the Dashboard heading should suppress the embedded chart title. | Mark the Dashboard chart `bare: true` and add one assertion that the dashboard subject does not render a second visible title. | Dashboard analytics summary only. | High |
| 2 | The Analytics view exposes Qlik implementation vocabulary instead of PaddlePoint vocabulary. | `CONTEXT.md` defines the six entries as Analytics subjects/tabs and says “Sheet” is never shown inside PaddlePoint. `app.js:1385` exposes `aria-label="Analytics sheets"` on the live navigation; `renderView()` routes staff to this markup. | Rename the user-facing label to “Analytics subjects.” Keep existing internal constants and Qlik `sheetId` fields unchanged. | Analytics subject navigation. | High |
| 3 | The analytics surface has competing containers and a parallel geometry scale, weakening the requested minimal hierarchy. | `app.js:1393-1403` wraps the entire mashup in `.panel.analytics-sheet-panel`; `qlik-mashup.js:316-358` then creates a bordered `.qm-card` per chart. `qlik-mashup.css:3-99` adds hard-coded `999px`, `12px`, `10px`, and `6px` radii even though `styles.css` defines the shared radius scale and the repository tests require named radii for the main stylesheet. The explicit brief asks for one consistent, professional, minimal system with more prominent analytics. | Let the analytics page itself be a flat layout, keep one surface per chart, replace hard-coded geometry with existing tokens, and concentrate emphasis in one KPI score strip instead of adding shadow, gradients, or more cards. | Dashboard analytics summary, Analytics shell, filters, KPIs, charts, and tables. | Medium pending signed-in visual verification. |

## Improve first

Remove the duplicate Dashboard chart title first. It is proven, isolated, and establishes the “one element, one job” rule the larger cleanup follows.

## Visual direction

### Subject, audience, and job

This is a staff operations console for company pickleball events—not a marketing dashboard. Its job is to turn governed Qlik measures into a calm, fast read during live operations.

### Tokens

- Court Night `#00102D`: shell/nav only.
- Paddle Navy `#0A1F54`: headings and the single hero KPI surface.
- Court Green `#3F9B46`: chart marks, selection state, and the hero rule.
- Paper `#FFFFFF`: chart and table surfaces.
- Soft Court `#F5F7FA`: page and secondary KPI background.
- Ink `#111827`: body and dense data text.

Use the existing semantic aliases for these values. Do not add colors, gradients, glows, or a second shadow language.

### Type

- Display role: Inter 800 for the active Analytics subject and hero number.
- Interface role: Inter 600/700 for navigation, labels, and table headings.
- Data role: Inter 400/600 with `font-variant-numeric: tabular-nums` for metrics, axes, and tables.

No new font dependency. The contrast comes from scale and weight, not a separate display family.

### Layout

Desktop:

```text
┌ Analytics / active subject ─────────────── Open in Qlik Cloud ┐
│ Overview  Match analysis  Leaderboard  Player…  Partner…  Court│
├──────────────────── selection/filter rail ────────────────────┤
│ ┌ hero KPI ─────────┬ KPI ───────┬ KPI ───────┬ KPI ───────┐ │
│ └───────────────────┴─────────────┴─────────────┴─────────────┘ │
│ ┌ primary trend / distribution ──────────────────────────────┐ │
│ └─────────────────────────────────────────────────────────────┘ │
│ ┌ supporting chart/table ───────┐ ┌ supporting detail ──────┐ │
│ └───────────────────────────────┘ └───────────────────────────┘ │
└────────────────────────────────────────────────────────────────┘
```

Mobile:

```text
Analytics / active subject
[horizontal subject rail →]
[filters, collapsed by natural wrapping]
[hero KPI full width]
[three secondary KPIs in a compact grid]
[charts and tables, one column]
```

### Signature

The “score strip” is the memorable element: one navy hero metric with a 3px Court Green rule and three quiet supporting metrics. It borrows the confidence and numeric clarity of the Scoreboard without copying its oversized live-match treatment. Everything below stays flat and white.

### Self-critique

The first direction risked becoming a generic BI dashboard through colorful KPI cards and elevated panels. This revision spends emphasis only on the score strip, keeps charts single-color, removes nested framing, and leaves tables deliberately quiet.

## Evidence chain

- Surface: Staff Dashboard analytics summary and staff Analytics view.
- Problem: repeated titles, product-language drift, nested card framing, and insufficient separation between primary metrics and supporting detail.
- Design evidence: existing semantic tokens and flat-panel rules in `styles.css`; native-UI ownership in ADR-0004; KPI hierarchy in `docs/qlik-sheet-design.md`; current runtime composition in `app.js` and `qlik-mashup.js`; the user's request for minimal, prominent, consistent analytics.
- Owner: `app.js`, `qlik-mashup.js`, and `qlik-mashup.css`.
- Scope and affected surfaces: Staff Dashboard analytics summary and all six Analytics subjects at desktop, tablet, and phone widths.
- Uncertainty: the final density, long-label behavior, and mobile subject rail require a valid staff session and real Qlik data in a visible browser.

## Design decision

Keep the existing headless-Qlik architecture and chart catalogue. Revitalize only composition and styling: one flat Analytics canvas, one score-strip emphasis point, token-backed geometry, consistent subject navigation, and no duplicated labels. This improves hierarchy without adding a component library, visualization dependency, or alternate design system.

## Reuse

- Existing tokens: `--surface-page`, `--surface-panel`, `--surface-nav`, `--border-card`, `--color-heading`, `--color-text-muted`, `--court`, `--radius-sm`, `--radius-md`, `--radius-lg`, `--radius-pill`, `--space-*`, and `--motion-duration-*`.
- Existing components: `.page-title`, `.button`, `.panel-head`, `.data-freshness-cue`, `.qm-selections-bar`, `.qm-table`, and the current SVG renderers.
- Existing data hierarchy: `hero: true`, four-KPI maximum, `wide`, `tabs`, and paged tables in `SUBJECTS`.
- Exemplar: the flat application shell and routine panel rules in `styles.css`, not the auth card.

No new primitive or dependency is required. Add a `bare` dashboard chart flag and CSS modifiers only where the existing analytics markup cannot express the chosen hierarchy.

## Changes

1. `qlik-mashup.js`
   - Change: set the Dashboard “Matches Over Time” chart to `bare: true`; preserve its accessible SVG label and details table.
   - Change: keep the current subject catalogue, governed measures, paging, selection state, error isolation, and Qlik session lifecycle unchanged.
   - Change: if needed for styling, add only semantic modifiers derived from existing chart fields (`hero`, `wide`, and type); do not add a presentation configuration layer.
   - Verify: the Dashboard card has one visible “Matches Over Time” heading and every Analytics subject still mounts the same Qlik objects.

2. `app.js`
   - Change: label the navigation “Analytics subjects.”
   - Change: make the active subject the page's primary heading and place its description directly beneath it; remove the duplicate inner subject heading and the generic “Staff access, Qlik Cloud” badge.
   - Change: keep “Open in Qlik Cloud” as a quiet tertiary handoff aligned with the page heading.
   - Preserve: routes, six subject names, `sheetId` handoff URLs, role restrictions, data freshness text, and `data-action`/`data-value` hooks.
   - Verify: switching a subject changes one primary heading, description, active navigation state, and mashup subject without duplicating names.

3. `qlik-mashup.css`
   - Change: make `.analytics-sheet-panel`/`.analytics-sheet-frame` visually flat so `.qm-card` is the only chart surface.
   - Change: replace hard-coded radii, common spacing, font sizes, and weights with the existing scales where an exact token exists.
   - Change: render subject navigation as a quiet rail; at compact widths use one horizontally scrollable row rather than a multi-row wall of pills. Preserve a clear static active cue and keyboard focus.
   - Change: style `.qm-kpi--hero` as the navy score strip with Court Green structural rule and white text; keep the other three KPIs on `--surface-page`. Use no gradient and no elevation above `--elevation-1`.
   - Change: keep chart marks Court Green/Paddle Navy, reduce non-data ink, and retain exact values in the existing data table. No decorative chart animation.
   - Change: use the existing 160–220ms motion scale; specify exact transitioned properties and preserve reduced-motion behavior.
   - Verify: desktop has one focal score strip; mobile has no horizontal page overflow; long tab labels remain reachable; filters, selections, empty/error states, pagers, and tables remain legible.

4. `tests/qlik-mashup.test.js`
   - Change: add the smallest assertions for the dashboard's `bare` title contract, “Analytics subjects” vocabulary, and token-backed analytics radii.
   - Preserve: all current Qlik data-shape and renderer tests.
   - Verify: the test fails if a second dashboard title returns, “Sheet” leaks into the user-facing Analytics navigation, or raw radii return to `qlik-mashup.css`.

5. `DESIGN.md` after visual acceptance
   - Change: add a signed-in Staff Analytics section documenting the score strip, flat chart surfaces, subject rail, Inter hierarchy, and mobile stacking. Keep the existing auth scope intact.
   - Verify: the documentation clearly separates auth-only Geist rules from signed-in Inter rules.

## Scope

- Inherit: all six Analytics subjects and the single Dashboard analytics summary chart.
- Verify: Dashboard at 1440×900 and 1024×768; Analytics Overview, Leaderboard, and Player Performance at 1440×900, 768×1024, and 390×844; loading, populated, empty, partial-chart-error, full-session-error, active-selection, and paged-table states.
- Exclude: Qlik calculations/master items, API endpoints, authentication, Tournament/Scoreboard/Live Board presentation, new chart types, dark mode, export features, and a new design-system package.

## Validation

- Product: a staff user can identify the primary metric, understand current filters, switch Analytics subjects, inspect exact values, and reach Qlik Cloud without duplicate labels.
- Interface: verify the viewports and states above with real Qlik data; inspect long player/event names and four-digit metric values; confirm the subject rail scrolls without hiding keyboard focus.
- System: confirm every analytics color, radius, spacing, and motion value reuses `styles.css` tokens and that no parallel card/button pattern is introduced.
- Repository: `node --test tests/qlik-mashup.test.js tests/semantic-ui-tokens.test.js tests/restrained-elevation.test.js tests/product-vocabulary.test.js` → all pass.
- Graph: `graphify update .` → graph reflects the accepted source changes.

## Stop conditions

- Stop if a valid staff session shows that the existing shell or Qlik data density differs materially from this traced composition.
- Stop if the active subject cannot become the primary heading without breaking URL-backed view restoration or focus management.
- Stop if styling the hero metric requires copying a Qlik expression or calculation into JavaScript.

## Design documentation

- After acceptance and visual validation: record the signed-in Staff Analytics rules in `DESIGN.md`; do not modify the auth decisions already documented there.
