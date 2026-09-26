# 14 — Migrate application shell and sign-in styles to semantic tokens

**What to build:** The application shell (side rail, mobile drawer, scrim, top bar, identity, logout) and the sign-in and session loading styles use only the semantic token vocabulary for color, surface, border, state, and shadow. This is the first migrate batch of the token contract: about 259 style references still use the original brand variables and about 103 use raw color literals, while only 11 use semantic tokens.

Origin: UI polish audit finding M5. Wide refactor sequenced as expand (done in P2-01), migrate in batches (14–17), contract (18).

**Blocked by:** 01 through 13 (all visual polish tickets, so migration does not collide with their changes)

**Status:** completed

- [x] Shell and sign-in styles reference semantic tokens instead of original brand variables or raw colors
- [x] Any color role that has no semantic token yet (for example navigation hover, scrim, or dark-shell card border) gets a named semantic token rather than staying a literal
- [x] The original brand variables still exist, so other screens keep working during the migration
- [x] There is no intended visual change: sign-in (all portals), session loading, desktop expanded and collapsed rail, laptop density, and mobile drawer look identical before and after
- [x] The existing automated test suite remains green

Implementation notes:
- 65 shell and sign-in declarations moved to semantic tokens. New tokens carry today's exact values: auth shell ground, scrim, nav control, nav hover, shell hover, nav edge/divider/control borders, shell and control borders, card border, heading, on-dark and on-dark-muted text, portal accents (admin, player, visitor), spinner tracks, and success feedback.
- Rules shared with other surfaces (for example the Live Board tab or generic inputs) stay for their own batches.
- A guard test fails if a shell-only or sign-in-only rule references an original brand variable or a raw color, and checks that the original variables still exist.
- No-change proof: computed color, background, borders, shadow, outline, and opacity for 1,529 element states were captured before and after (all three portals at rest, with field errors, with a sign-in failure, and pending; auth feedback and session loading specimens; shell at 1366 expanded and collapsed, 1100 laptop density, 768 drawer closed and open, 375 drawer open). All 1,529 matched exactly.
- Hover states cannot be captured as computed styles; their four declarations map to tokens holding the identical values.
