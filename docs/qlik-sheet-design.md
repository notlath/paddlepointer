# Qlik Sheet design standard

How the six embedded Sheets are composed. Applies to every Sheet shown in PaddlePoint's
Analytics view, and to the single chart embedded on the Admin dashboard where noted.

Written 2026-09-20 after a grilling session. The problem it fixes: the Sheets were
composed ad hoc, ran to 20–28 grid rows, and carried up to seven equal-weight KPI tiles
each — cluttered, with no hierarchy.

## Sheet mode: responsive, never extended

Every Sheet uses `layoutOptions.sheetMode = RESPONSIVE` on the standard 24×12 grid, with
extension off. A regular Sheet renders at 1920×1280; an extended one at 1920×2880 — and
PaddlePoint's embed frame is 850px tall. An extended Sheet therefore scrolls inside a
frame that itself sits in a scrolling page.

The 12-row ceiling is the point. It makes the object budget a constraint Qlik enforces
rather than a guideline that drifts. Responsive mode also gets `layoutOptions.mobileLayout`
(objects stack into a list at narrow widths), which covers the tablet case for free.

## Zones

Four zones, in this order. A Sheet with nothing worth putting in a zone leaves it out and
the next zone moves up — do not invent content to fill a zone.

```
cols  1-4      5-12            13-24
     ┌────────┬───────────────┬──────────────────────┐
rows │        │ hero KPI      │ up to 3 KPIs         │  KPI band
1-2  │        │  8×2, 1 tile  │   12×2               │
     │ filter ├───────────────┴──────────────────────┤
3-6  │ pane   │  one chart               20×4        │  trend
     │ 4×12   ├──────────────────┬───────────────────┤
7-12 │        │ table            │ table / container │  detail
     │        │   10×6           │       10×6        │
     └────────┴──────────────────┴───────────────────┘
```

**Filter pane** — left column, 4×12, identical position and size on every Sheet. A pane
that moves between tabs reads as chaos. Left rather than a top strip: both cost 48 of 288
cells, but the left column preserves full height for tables, where rows are the scarce
resource in an 850px frame — and it matches Qlik Cloud, so the "Open in Qlik Cloud"
handoff lands somewhere that looks like where staff came from.

**KPI band** — at most four numbers, one of them dominant. A Qlik KPI object renders every
measure in it at equal weight, so the hero is its own single-measure object beside a
smaller object holding up to three. Two rows is ~140px; ample for a large number.

**Trend** — one chart, the story behind the hero number.

**Detail** — tables. Two tables answering the same question share a tabbed container
rather than taking a slot each.

## KPI rules

- Four maximum. Seven equal-weight tiles means no number is important.
- Demote anything already legible as a column in a table on the same Sheet.
- Never invent a KPI to fill the band. That is how seven meaningless tiles happen.
- A rate needs its denominator beside it. Win % without Matches is a lie at low sample
  size — the same reason Partnerships are only ranked at 3+ Matches together.

## Duplication

Do not draw values that are already visible as a column of a table in the same viewport.
Removing Player Performance's `Score Margin by Match` bar is the worked example: it plotted
per-Match margin, which is the Point Differential column of the Match History table below it.

An aggregate over a dimension the KPI collapses is **not** duplication. `Win % Over Time`
stays even though Win % is the hero KPI — a trend and a total are different readings. Do
not apply the rule above to trend lines.

## Titles and theme

Object titles stay **on** inside Sheets: the PaddlePoint `h2` names the Sheet, the Qlik
title names the object. Six unlabelled objects is not clean, it is unreadable.

The single chart embedded on the Admin dashboard is the opposite case — the PaddlePoint
card heading does duplicate the chart title, so it sets `showTitles:false`. That override
requires `preview="true"` on the `qlik-embed` element; without it Qlik ignores it.

Every Sheet embeds with `theme="PaddlePoint"` (`qlik-theme/paddlepoint-qlik-theme/`), not
`Sense Horizon`. Keep `preview="true"`: it is what gives improved theme alignment with the
native Qlik client, plus legacy-chart and extension support.

Watch for one trap. The theme sets `backgroundColor: transparent` so a single chart blends
into a native PaddlePoint card. Across a whole Sheet that makes every object transparent
and they lose the white cards that separate them. If a Sheet flattens, build a second theme
`PaddlePoint Sheet` with `backgroundColor: @surface` and keep the transparent one for
card-embedded single charts.

## Who edits, and how

Hand-edit in the Qlik UI. Qlik MCP and the engine API are for reading only.

Charts created programmatically lack the defaults the Qlik editor writes: they came out
with no `visualization` property (qlik-embed's stardust calls
`layout.visualization.toLowerCase()` and throws, so they painted blank), and repairing that
unpublished every Sheet. Per `.scratch/qlik-event-dashboard/fix-missing-visualization.mjs`,
they also lack axis, legend and colour defaults, so `sn-bar-chart`, `sn-line-chart` and
`sn-scatter-plot` can still throw.

The cost is that visual work is not in git. Accept it — `theme.json` is the part worth
versioning and it is already committed.

**Rebuild, do not edit.** An object created through the API can be missing the renderer's
default properties: a healthy `barchart` carries 88 property paths, a `linechart` 96, a
`table` 48, and a starved one carries 18. A starved object mounts, shows its title, draws
nothing, and throws `TypeError: Cannot read properties of undefined (reading 'auto')` — the
renderer reading `.auto` off a `color` or `gridLine` object nobody wrote. Editing such an
object in place does not add the missing defaults; recreating it in the editor does.

Gate every Sheet on `.scratch/qlik-sheet-design/check-object-health.mjs`. It compares each
chart and table against a pinned healthy path count for its type and exits non-zero if any is
starved — or merely unverifiable, because a gate that goes green on "we could not tell" is not
a gate. The counts are pinned rather than derived from the app on purpose: a derived baseline
is the richest object of that type present, so a type whose every object is starved would set
a starved baseline and score itself healthy.

It deliberately does not gate `kpi` (24-51 paths) or `filterpane` (11), which vary
legitimately and render fine at their smallest. When a type gains its first healthy example —
`scatterplot` has none today — pin its count so the next one can be judged.

## Verifying

Check rendering in a **visible** browser at `https://paddlepoint.test` (the tenant's CORS
allowlist only has that origin, so the site must be served via `herd secure paddlepoint`).
A hidden browser pane pauses `requestAnimationFrame`, which makes every chart look blank
whether it is broken or not.

A Sheet that is not published is invisible to the embed user — `GetObject` returns
`qHandle: null`, and the Sheet reads "Loading…" forever in the browser. Writing object
properties over the engine API can silently unpublish every Sheet, so re-check with
`render-as-embed-user.mjs` after any programmatic write.
