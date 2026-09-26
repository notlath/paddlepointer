# Live Board side panel stops reserving dead space for empty slots

Written against: `fd05939c58ff0eca2c47935064f41a5bb6e32f82`

## Evidence chain

- Surface: the Live Board side panel (`Top Players` and `Next Matches` cards) at `?view=live`, inside the `live-tv-mode` breakpoint (`min-width: 1400px` and `min-height: 900px` — the "XL" viewport threshold this surface uses).
- Problem: direct observation. Rendered at 1600x1000 with a tournament that had only 1-2 queued matches (fewer than the 4-slot layout) and 2-4 completed players (fewer than the 5-slot layout): `.live-next-list` reserved 4 fixed row tracks (`67.3px` each, `269px` total) while only 1-2 `<article class="live-next-match">` children existed, leaving 134-200px of unstyled empty space at the bottom of the "Next Matches" card. `.top-player-list` reserves 5 tracks the same way and shows the identical trailing gap whenever fewer than 5 players have results.
- Design evidence: `styles.css:3661-3667` forces `.top-player-list` to `grid-template-rows: repeat(5, minmax(0, 1fr))` and `.live-next-list` to `repeat(4, minmax(0, 1fr))` — a fixed slot count instead of the actual item count. This directly contradicts the sibling `.live-tv-mode .live-score-grid` rule at `styles.css:3612-3616`, whose own comment states the system's content-sizing principle for this exact breakpoint ("The grid is only as tall as its cards... spare height is centered around the board") and which was fixed this session to center on content instead of reserving fixed capacity.
- Owner: `styles.css`, section `10. LIVE TV MODE`.
- Scope and affected surfaces: `.live-tv-mode .top-player-list` and `.live-tv-mode .live-next-list` (styles.css:3661-3667) only. `app.js:2558` and `app.js:2604-2627` already render exactly as many rows as there are real results/matches — no JS or markup change needed.
- Uncertainty: none. Reproduced directly via a stubbed-fetch preview harness (deleted after use); the fix mirrors a pattern already applied elsewhere in this exact stylesheet section this session.

## Design decision

Replace the fixed `repeat(N, minmax(0, 1fr))` row templates on `.live-tv-mode .top-player-list` and `.live-tv-mode .live-next-list` with content-sized rows (`grid-auto-rows: minmax(0, max-content)`) and center the resulting list vertically within its card (`align-content: center`). This is the same fix already applied to `.live-tv-mode .live-score-grid` / `.live-tv-mode .live-side-panel` in this session: rows keep a stable, predictable height, and any leftover space is distributed around the list instead of left as dead space below it.

## Reuse

- `.live-tv-mode .live-score-grid` (`styles.css:3612-3616`) — the exact problem, already solved this session with `align-self: center; height: auto; max-height: 100%`.
- `.live-tv-mode .live-side-panel` (`styles.css:3618-3621`) — `align-content: center` already applied at the panel level.
- Exemplar: `styles.css:3610-3621`.

## Changes

1. `styles.css:3661-3667`
   - Change: on `.live-tv-mode .top-player-list`, replace `grid-template-rows: repeat(5, minmax(0, 1fr));` with `grid-auto-rows: minmax(0, max-content); align-content: center;`. On `.live-tv-mode .live-next-list`, replace `grid-template-rows: repeat(4, minmax(0, 1fr));` with the same pattern.
   - Preserve: `min-height: 0; overflow: hidden;` (styles.css:3655-3659) and all row padding/typography rules (styles.css:3669-3745). Preserve the existing 5-player / 4-match cap enforced in JS (`app.js:2558`'s `.slice(0, 5)`; `SLOT_COUNT` in `live-board.js:4`).
   - Verify: with fewer than 5 completed players or fewer than 4 queued matches, no empty grid track renders below the last populated row. With the full 5/4 items present, the layout is visually unchanged from today.

## Scope

- Inherit: Live Board at `?view=live`, `live-tv-mode` breakpoint only (`min-width: 1400px` and `min-height: 900px`).
- Verify: both the "Ongoing Match" and "Next Match" tabs drive the same `.live-score-panel` markup and are unaffected. Re-check `.live-score-grid.all-courts-grid` (more than 4 courts) stays untouched — it is a different selector.
- Exclude: the sub-1400px fallback layout (`styles.css:4938-4946`), which already uses natural document flow and does not reserve fixed row capacity. Also exclude a data anomaly observed during evidence gathering — a completed match's participant occasionally renders an empty name/stats row in `.top-player-list` — that traces to `buildTournamentStats` (`app.js:4718`), a computation bug, not a design finding.

## Validation

- Product: a Super Admin opens `?view=live` on a 1440x900+ display before 5 results or 4 upcoming matches exist; the "Top Players" / "Next Matches" cards show only populated rows with no dead band beneath them.
- Interface: viewport widths 1400px, 1600px, 2200px+; item counts 0, 1, 2, 4, and 5+ for both lists.
- System: confirm no other `.live-tv-mode` list still uses `repeat(N, minmax(0, 1fr))` for a capacity-based grid, so the fix isn't half-applied.
- Repository: `grep -n "repeat(4, minmax(0, 1fr))\|repeat(5, minmax(0, 1fr))" styles.css` → no remaining matches inside the `.live-tv-mode .top-player-list` / `.live-next-list` rule.

## Stop conditions

- Stop if either list gains a scrollable/overflow requirement elsewhere that depends on the fixed track count (none found in the current CSS or JS).

## Design documentation

No design document governs the Live Board surface (`DESIGN.md` is scoped to the auth portals and signed-in staff analytics only; `CONTEXT.md` is terminology only). Nothing to record.
