# Live Board side panel revitalization: Top Players and Next Matches

Written against: `fd05939c58ff0eca2c47935064f41a5bb6e32f82` plus the current dirty worktree (includes this session's side-panel capacity and alignment fixes)

## Visual direction

### Subject, audience, and job

The Live Board is a spectator/courtside display. `Top Players` and `Next Matches` are its supporting rail next to the main score cards — their job is a fast, glanceable read ("who's leading", "what's next"), not data entry. They currently read as plain text lists next to the bold, navy, tabular-number score cards, so they feel like an afterthought rather than part of the same broadcast-style system.

### Tokens

- `--surface-rank-badge`: the existing circular badge surface already used for player rank numbers — reused as-is for the new court badge, so both lists share one "circle badge = row identity" grammar.
- `--color-success` (semantic alias of `--court-dark`, `#276b37`): the light-surface equivalent of the score cards' dark-surface winner accent (`--color-primary` / `--accent`, reserved for navy cards per `DESIGN.md`). Used only to mark a player's win rate at or above 50%.
- `--color-heading`, `--color-text-muted`: unchanged, already govern the rest of both rows.

No new colors, radii, or shadows.

### Signature

Both lists get one small, restrained "identity beats plain text" upgrade: `Top Players` already has this (trophy icon / rank circle); `Next Matches` gets the matching treatment — a circular court-number badge in the same 34px column the alignment fix already reserved, so the two lists now visibly belong to the same system instead of one having a badge and the other having empty space. `Top Players` gets one quiet semantic accent: a leading win rate reads in Court Green instead of flat gray, mirroring the score cards' own winner-accent convention without copying its dark-surface color.

### Self-critique

The obvious over-reach here would be color-coding every stat, adding icons per row, or animating list entry on a display nobody interacts with. Rejected all three: the court badge reuses an existing token and column that already existed for exactly this purpose, and the win-rate accent is the only new color decision, gated by a real threshold (leading vs not) rather than decoration for its own sake.

## Evidence chain

- Surface: the Live Board side panel (`Top Players` and `Next Matches` cards) at `?view=live`, both the base (<1400px) and `live-tv-mode` (>=1400px/900px) layouts.
- Problem: direct observation. `Next Matches` (`app.js:2828-2838`, `renderLiveNextMatch`) renders only plain stacked text with no visual anchor, while its sibling `Top Players` row (`app.js:2808-2826`, `renderTopPlayerRow`) has a rank badge/trophy. This session's alignment fix (`styles.css:3720` base / `styles.css` XL block) gave `.live-next-match` a leading 34px grid column to match `.top-player-row`'s rank column, but left it empty — there is now reserved space with nothing in it. Separately, `.top-player-record span` (the win rate) uses the same muted gray as incidental stats (`games`, `minutesPlayed`), so nothing distinguishes a dominant record from an average one, even though the main score cards already use a Court Green/lime accent for a match winner (`styles.css:3069-3072`, `.is-winner`).
- Design evidence: `DESIGN.md` does not govern this surface (scoped to auth portals and signed-in staff analytics only); the "Court Green is the only interface accent, lime stays inside the logo" rule (`DESIGN.md` section 2/7) and the `.is-winner`/`.is-trailing` accent convention already implemented in `styles.css:3069-3081` are used here as the closest in-repo precedent, adapted to a light card surface via `--court-dark` instead of `--accent`.
- Owner: `app.js` (both render functions), `styles.css` (`.top-player-*`, `.live-next-*` rules).
- Scope and affected surfaces: `Top Players` and `Next Matches` cards only, both breakpoints.
- Uncertainty: none — both changes are additive, token-only, and verified in a rendered preview harness before and after.

## Design decision

Give `Next Matches` a court-number badge that fills the column already reserved for it, using the same circular badge surface as `Top Players`' rank circle. Give `Top Players`' win rate a Court Green accent when a player is leading (winRate >= 50), reusing the score cards' own winner-accent convention on a light-surface token. No new components, colors, or layout primitives.

## Reuse

- `--surface-rank-badge` (existing circle badge token, currently only on `.top-player-rank span`).
- `--color-success` (existing semantic token for `--court-dark`; `tests/live-board-tokens.test.js` requires Live Board styles to use semantic tokens, not brand variables).
- Existing `is-winner`/`is-trailing` naming convention (`styles.css:3069-3081`) — reused as `is-leading` for the new win-rate accent, since "winner" doesn't apply to an in-progress tournament standing.
- Exemplar: `.top-player-rank span` (`styles.css:3285-3294`) for the new `.live-next-court` badge; `.live-score-card.final .live-score-team.is-winner` (`styles.css:3069-3072`) for the win-rate accent pattern.

## Changes

1. `app.js:2828-2838` (`renderLiveNextMatch`)
   - Change: add a `<span class="live-next-court" aria-hidden="true"><b>${escapeHtml(match.court)}</b></span>` as the first child of the `<article>`, before the existing text `<div>`. The existing "Round X - Court Y" text line stays as the accessible source of truth; the badge is decorative.
   - Preserve: existing copy, `escapeHtml` usage, team text formatting.
   - Verify: each queued match shows a small circular court-number badge in the column the alignment fix reserved.

2. `app.js:2808-2826` (`renderTopPlayerRow`)
   - Change: add `class="is-leading"` to the win-rate `<span>` when `row.winRate >= 50`.
   - Preserve: existing markup structure, `escapeHtml`-free numeric interpolation (consistent with the rest of this function).
   - Verify: a player with winRate >= 50 shows the percentage in Court Green; a player below 50 keeps the current muted gray.

3. `styles.css` base rules (`.live-next-match`, `styles.css:3335-3342`)
   - Change: `grid-template-columns: minmax(0, 1fr);` -> `grid-template-columns: 34px minmax(0, 1fr);` so the new badge has a column at every width, not only `live-tv-mode`.
   - Add: a `.live-next-court` rule reusing `.top-player-rank span`'s circle treatment (`width/height: 34px`, `border-radius: 50%`, `background: var(--surface-rank-badge)`, `color: var(--color-heading)`, `font-weight: var(--font-weight-black)`).
   - Add: `.top-player-record span.is-leading { color: var(--color-success); font-weight: var(--font-weight-bold); }` near the existing `.top-player-record` rules (`styles.css:3330-3333`).
   - Verify: the badge and accent render correctly below 1400px too (this list is not `live-tv-mode`-only).

4. `styles.css` XL rules (`.live-tv-mode .live-next-match`, `.live-tv-mode .top-player-rank span`)
   - Change: add `.live-tv-mode .live-next-court { width: 28px; height: 28px; font-size: var(--font-size-xs); }` matching `.live-tv-mode .top-player-rank span`'s existing 28px shrink, so the badge scales down the same way its `Top Players` counterpart already does.
   - Preserve: the existing `grid-template-columns: 34px minmax(0, 1fr);` and `grid-column: 2` on `.live-tv-mode .live-next-match div` from this session's alignment fix — no change needed there.
   - Verify: the badge stays legible and correctly sized at 1400px, 1600px, and 2200px+ widths.

## Scope

- Inherit: `Top Players` and `Next Matches` cards inside `.live-side-panel`, both the base and `live-tv-mode` layouts.
- Verify: 0/1/2/4/5+ items in both lists (reusing this session's capacity-fix verification matrix); short and long court numbers (single vs double digit) and player names.
- Exclude: the main score-card grid (`live-score-grid`), the tab controls, and the `buildTournamentStats` data bug already flagged separately (`task_b2cca396`) — that bug is unrelated to this visual pass and must not be masked by it.

## Validation

- Product: a spectator scanning the side panel can immediately tell which court each upcoming match is on and which players are currently leading, without reading full sentences.
- Interface: 0-5 items in both lists; viewport widths spanning the `live-tv-mode` breakpoint (1399px vs 1400px); single- and double-digit court numbers; winRate values at 0%, 49%, 50%, and 100%.
- System: confirm no new color, radius, or spacing value is introduced outside `--surface-rank-badge`, `--court-dark`, and existing font-weight tokens; confirm `.live-next-court` and `.top-player-rank span` stay visually consistent (same badge language) at every breakpoint.
- Repository: `node --test tests/live-board.test.js` -> unaffected (pure presentation change, no data-shape change). Manual/rendered check via the preview harness (no automated visual regression test exists for this surface).

## Stop conditions

- Stop if `match.court` is ever missing/non-numeric for a queued match (not observed in current data shapes from `live-board.js`).
- Stop if the win-rate accent needs a different threshold than "leading" (>=50%) — that would require product input, not a design-evidence call.

## Design documentation

No design document governs the Live Board surface (`DESIGN.md` is scoped to the auth portals and signed-in staff analytics only). Nothing to record.
