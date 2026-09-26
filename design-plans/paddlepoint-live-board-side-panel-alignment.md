# Live Board side panel: align Next Matches text with Top Players text

Written against: `fd05939c58ff0eca2c47935064f41a5bb6e32f82`

## Evidence chain

- Surface: the Live Board side panel (`Top Players` and `Next Matches` cards, stacked in `.live-side-panel`) at `?view=live`, inside the `live-tv-mode` breakpoint (`min-width: 1400px` and `min-height: 900px`).
- Problem: direct observation. Rendered at 1600x1000, `getBoundingClientRect().left` measured `.top-player-name strong` at `1258px` and `.live-next-match strong` at `1216-1218px` — a ~40px offset — even though both cards' `.leaderboard-card-head` headings share the same left edge (~1216-1218px). The two lists' primary text does not line up down the shared column.
- Design evidence: `.top-player-row` is a 3-column grid, `[rank-badge][name][record]` (`styles.css:3258-3265`, XL override `styles.css:3669-3674`, badge width `34px` at `styles.css:3680-3684`), so its name column is pushed right by the rank badge + gap. `.live-next-match` is single-column with no leading badge (`styles.css:3335-3342`, XL override `styles.css:3718-3723`), so its text sits flush against the card's own padding. Both cards live in the same `.live-side-panel` (`styles.css:3380-3386`, XL `styles.css:3618-3621`), directly above/below each other on screen, so the inconsistency is visible within one glance.
- Owner: `styles.css`, section `10. LIVE TV MODE`. No JS/markup change is required for a CSS-only inset.
- Scope and affected surfaces: `.live-tv-mode .live-next-match` (`styles.css:3718-3723`) only.
- Uncertainty: none.

## Design decision

Give `.live-tv-mode .live-next-match` the same leading inset as `.top-player-row`'s name column, so both cards' primary text starts on one shared vertical line down the side panel. Add a spacer column sized to match the rank-badge track instead of changing `.top-player-row`'s already-correct layout.

## Reuse

- Token: the rank-badge column width already defined at XL, `34px` (`styles.css:3680-3684`), and its gap, `var(--space-2)` (`styles.css:3671`).
- Exemplar: `.top-player-row`'s `grid-template-columns: 34px minmax(0, 1fr) auto` (`styles.css:3669-3674`).

## Changes

1. `styles.css:3718-3723`
   - Change: give `.live-tv-mode .live-next-match` `grid-template-columns: 34px minmax(0, 1fr);` (a leading empty track matching `.top-player-rank`'s `34px`) in place of the current single `minmax(0, 1fr)`, and set the existing content wrapper to `grid-column: 2` so it occupies the second track.
   - Preserve: existing copy, `escapeHtml` output, and `overflow-wrap`/ellipsis rules already in place; `app.js:2828-2838`'s markup (`renderLiveNextMatch`) needs no change — the single child `<div>` just moves into the second grid column via CSS.
   - Verify: `.top-player-name strong` and `.live-next-match strong` report the same `getBoundingClientRect().left` at 1400px+ viewport widths.

## Scope

- Inherit: Live Board `live-tv-mode` breakpoint only (`min-width: 1400px` and `min-height: 900px`).
- Verify: the base (below 1400px) `.live-next-match` layout (`styles.css:3335-3342`) is untouched; the two cards stack full-width there and this XL-only shared-column rhythm doesn't apply.
- Exclude: `.leaderboard-card-head` alignment (already consistent between the two cards) and the data anomaly noted in the companion capacity plan (out of scope here too).

## Validation

- Product: staff scanning the Live Board side panel read both lists' names/labels starting on one visual column.
- Interface: 1400px, 1600px, 2200px+ widths; short and long player names and court labels (ellipsis behavior at `styles.css:3729-3735`).
- System: confirm no other consumer of `.live-next-match` markup (only the "Next Matches" card, `app.js:2617-2627`) depends on the current full-width single-column text.
- Repository: `grep -n "live-next-match" app.js` → confirms `renderLiveNextMatch` (`app.js:2828-2838`) is the only render path, so the CSS-only fix covers every place this markup appears.

## Stop conditions

- Stop if `.live-next-match` needs to share this inset below 1400px (out of scope; base layout intentionally differs and is not part of this request).

## Design documentation

No design document governs the Live Board surface (`DESIGN.md` is scoped to the auth portals and signed-in staff analytics only; `CONTEXT.md` is terminology only). Nothing to record.
