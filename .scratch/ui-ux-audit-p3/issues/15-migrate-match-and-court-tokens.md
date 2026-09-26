# 15 — Migrate Match Setup, Scoreboard, and court styles to semantic tokens

**What to build:** Match Setup, the court preview, the Scoreboard (score tiles, rally buttons, court board, controls), the Match summary, and destructive and recovery dialogs use only semantic tokens for color, surface, border, state, and shadow.

Origin: UI polish audit finding M5. Migrate batch 2 of 4.

**Blocked by:** 14 — Migrate application shell and sign-in styles to semantic tokens

**Status:** completed

- [x] Match and court styles reference semantic tokens instead of original brand variables or raw colors
- [x] The single court model (surface, kitchen, lines, net) is expressed through named court tokens
- [x] Missing roles get named semantic tokens rather than staying literals
- [x] The original brand variables still exist for screens not yet migrated
- [x] There is no intended visual change: singles and doubles setup, Team A and Team B serving, upcoming and final Match summary, and dialogs look identical before and after on desktop and mobile
- [x] The existing automated test suite remains green

Implementation notes:
- Migrated 46 rules across Sections 03, 06, 07, 09, 12, 13D, and 27 in styles.css to semantic tokens, eliminating legacy brand variables (--navy, --court, --accent, etc.) and raw color literals.
- Expressed the single court model through named court tokens: `--court-surface-ground: #276b37`, `--court-kitchen-ground: #102b66`, `--court-line-color: #ffffff`, and `--court-net-color: #ffffff`.
- Defined 24 named semantic tokens for dark card surfaces (`--surface-card-dark`, `--surface-preview-score`, `--surface-court-label`, `--surface-service-zone`, `--surface-court-card`, `--surface-board-meta-row`, `--surface-rally-alt`, `--surface-rally-hover`, `--surface-rally-alt-hover`, `--surface-segment-hover`, `--surface-dialog-overlay`, `--surface-switch-off`), borders/indicators (`--border-court-card`, `--border-dialog`, `--border-serving`, `--glow-serving`, `--shadow-service-active`), and high-contrast text on dark backgrounds (`--color-on-dark-secondary`, `--color-on-dark-subtle`, `--color-on-dark-readable`, `--color-on-dark-score`).
- Preserved original brand variables in `:root` for unmigrated surfaces (Batches 3 & 4).
- Created guard test `tests/match-court-tokens.test.js` validating that Match Setup, Scoreboard, court, summary, and dialog rules use only semantic tokens, court model tokens are used properly, semantic tokens are defined, and legacy variables remain preserved.
- Verified exact 0-change visual parity: every new and mapped token resolves to the identical color and opacity values before and after.
