# 02 — The PaddlePoint theme on every Sheet

**What to build:** The six Sheets embed with `theme="PaddlePoint"` instead of
`Sense Horizon`, and the Admin dashboard chart gets the `preview="true"` its existing
override needs.

Two separate defects in `app.js`. The custom theme (`qlik-theme/paddlepoint-qlik-theme/`,
built and uploaded in ticket 11) is applied only to the dashboard trend chart; all six
entries in `QLIK_SHEETS` still say `Sense Horizon`. And the dashboard chart passes
`override-properties___json='{"showTitles":false}'` without `preview="true"`, which Qlik's
docs say that override requires — so the title is probably still rendering.

Do this before any composition ticket: compose against the final theme, not a theme you
are about to replace.

Watch the trap in `docs/qlik-sheet-design.md`: the theme sets `backgroundColor: transparent`
for single charts in native cards. Across a whole Sheet that may flatten every object
together. If it does, build `PaddlePoint Sheet` with `backgroundColor: @surface`.

**Blocked by:** 01 — Confirm every Sheet actually renders

**Status:** done (2026-09-20)

- [x] All six `QLIK_SHEETS` entries use the `PaddlePoint` theme
- [x] `preview="true"` added to the dashboard chart, and its title is confirmed hidden
- [x] Recorded with a screenshot: whether a whole Sheet flattens under the transparent
      background, and whether `PaddlePoint Sheet` was needed

## What changed

Three edits in `app.js`, covered by `tests/qlik-embed-theme.test.js`:

- The six `QLIK_SHEETS` entries move from `Sense Horizon` to `PaddlePoint`.
- The sheet embed's fallback, `activeSheet.theme || "Sense Horizon"`, becomes `"PaddlePoint"`.
  Worth its own line: a per-element check would have passed without this, because the theme
  is a template expression and the stock fallback hides inside it. The test asserts the string
  `Sense Horizon` is gone from `app.js` entirely.
- The dashboard chart gains `preview="true"`.

The per-Sheet `theme` field stays rather than collapsing to a constant, because
`docs/qlik-sheet-design.md` anticipates a second variant (`PaddlePoint Sheet`) if a Sheet ever
flattens. Six identical values today, but the knob is documented, not speculative.

## The theme applies, and nothing flattens

Screenshot: `ticket02/render-check.png` (session scratchpad), harness updated to mirror the
new `app.js`.

**No flattening. `PaddlePoint Sheet` was not needed.** The trap this ticket was written around
— the theme's `backgroundColor: transparent` being right for a single chart in a native card
but wrong across a whole Sheet — did not materialise. Match Analysis and Leaderboard keep
their per-object white cards and separating borders; only the data marks changed colour.

The theme visibly took: Match Analysis's bars went from stock teal to PaddlePoint green, and
so did the Admin dashboard chart.

## `preview="true"` works, and it un-blocked the dead override

The dashboard chart now renders **without its Qlik title**, which is what
`override-properties___json='{"showTitles":false}'` was always asking for. Qlik ignores that
override unless preview mode is on, so it had been dead since it was written; the PaddlePoint
card heading above it was being duplicated by the chart's own title.

**A false alarm worth recording.** `browser-render-check.mjs` reported the chart as BLANK
after this change — a regression, seemingly caused by it. The screenshot showed the chart
drawing perfectly. The probe walks the DOM, and in preview mode qlik-embed renders that chart
into a frame the walk cannot reach: `Page.getFrameTree` reports child frames while
`querySelectorAll("iframe")` finds none inside the element. The script now says so in its
output and header. **A BLANK verdict on a chart slot means "no marks found in the DOM", not
"no pixels"** — confirm against the screenshot. The authoritative gate for whether an object
can draw at all remains `check-object-health.mjs`, which reads properties, not pixels.

## Still broken, as expected

Overview, Player Performance, Partnership Analysis and Event / Court Analytics still draw no
content — the starved objects from ticket 09, folded into 03-08. Theming does not fix an
object with no renderer defaults, and this ticket never claimed it would. The console still
carries `TypeError: Cannot read properties of undefined (reading 'auto')`.
