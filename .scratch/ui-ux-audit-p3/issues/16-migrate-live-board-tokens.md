# 16 — Migrate Live Board and TV mode styles to semantic tokens

**What to build:** The Live Board, its tabs, court cards in every state, the expanded score overlay, top players, next Match, and TV mode use only semantic tokens for color, surface, border, state, and shadow.

Origin: UI polish audit finding M5. Migrate batch 3 of 4.

**Blocked by:** 15 — Migrate Match Setup, Scoreboard, and court styles to semantic tokens

**Status:** completed

- [x] Live Board and TV mode styles reference semantic tokens instead of original brand variables or raw colors
- [x] Court-card state surfaces (ongoing, upcoming, final, available, unscheduled, loading, failed) are expressed through named state tokens
- [x] Missing roles get named semantic tokens rather than staying literals
- [x] The original brand variables still exist for screens not yet migrated
- [x] There is no intended visual change: every court-card state, the expanded overlay, and TV mode with 1, 2, 4, and all courts look identical before and after
- [x] The existing automated test suite remains green

Implementation notes:
- Migrated 50 selectors across Section 09 (Live View, tabs, court cards, overlay, top players, next Match) and Section 10 (Live TV Mode) in styles.css to semantic tokens, removing all legacy brand variables (--navy, --court, --accent, etc.) and raw color literals.
- Expressed court-card state surfaces and borders for all 7 states (ongoing, upcoming, final, available, unscheduled, loading, failed) through named state tokens: `--surface-court-card-*` and `--border-court-card-*`.
- Defined 26 named semantic tokens in `:root` for court cards, tab track (`--surface-tab-track`), rank badges (`--surface-rank-badge`), podium gradient (`--surface-podium`), trophy iconography (`--color-trophy-gold`, `--shadow-trophy`, `--color-trophy-silver`, `--color-trophy-bronze`), card refresh feedback (`--color-refresh-state`, `--color-refresh-state-failed`), and text on dark (`--color-on-dark-dimmed`, `--color-on-dark-divider`, `--border-on-dark`).
- Preserved original brand variables in `:root` for unmigrated surfaces (Batch 4: Tournament, records, and people).
- Created guard test `tests/live-board-tokens.test.js` validating that Live Board and TV mode styles strictly reference semantic tokens, all 7 court-card state surfaces are expressed through named state tokens, semantic tokens are defined, and legacy variables remain preserved.
- Maintained exact 0-change visual parity: every new and mapped token resolves to the identical color, alpha, gradient, and shadow values before and after.
- All 343 automated tests in `node --test` are passing green.
