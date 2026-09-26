# Revitalize the PaddlePointer sign-in portal family

Written against: `3334bd3e8773326cf398d267aa6324b1127612c4`

## Design language

- Audited surface: the Admin, Player, and Visitor sign-in portals rendered by `renderLogin()` at `/`, `/?player=1`, and `/?visitor=1`, including the 390 × 844 mobile branch.
- Design sources: `CONTEXT.md`; `index.html`; `app.js:945-1055`; `styles.css:14-245`, `styles.css:286-383`, `styles.css:624-894`, and `styles.css:3989-4040`; `tests/one-sign-in-portal-family.test.js`; `tests/load-inter-typeface.test.js`; rendered desktop and mobile states inspected on 2026-09-16; the requested `stitch-design-taste` rules.
- Documented decisions: keep one dark navy auth shell, the white horizontal PaddlePointer logo, the same three portals, the same form fields and portal-specific copy, the same validation and loading states, 44 px minimum controls, restrained elevation, no gradient portal cards, and one-column mobile behavior.
- Governing owners and consumers: `renderLogin()` and `renderLoginPortalButtons()` own portal markup; auth selectors and semantic tokens in `styles.css` own presentation; `index.html` owns the typeface request; the three sign-in routes and session-loading state consume the system.
- Explicit exceptions: None documented.

## Findings

| # | Problem | Evidence | Proposed change | Scope | Confidence |
| --- | --- | --- | --- | --- | --- |
| 1 | The desktop entry surface is visually generic and does not communicate the energy of a company pickleball event. | The rendered 1440 × 720 portals place a floating logo directly above a centered 560 px white card. `styles.css:631-638` fixes the shell to one centered column. The requested Stitch direction calls for an offset, asymmetric composition while retaining clean spatial separation. The same markup reaches all three sign-in routes through `renderLogin()`. | On viewports at or above 768 px, make `.clean-auth-shell` a two-column grid: a brand/event rail containing the existing logo and existing tagline “Tap to score. Rules handled.”, and the unchanged auth card. Keep the current single-column order below 768 px. | `app.js`, auth-only rules in `styles.css`, and portal layout assertions in `tests/one-sign-in-portal-family.test.js`. | High |
| 2 | Inter on the auth portals conflicts with the requested Stitch premium design language. | `index.html:28` requests Inter and `styles.css:278` applies it to every rendered portal. `tests/load-inter-typeface.test.js` locks that choice in. Stitch explicitly bans Inter for premium interfaces and recommends Geist for software UI. | Load Geist alongside Inter and scope it to `body.auth-mode`, retaining Inter on excluded signed-in screens plus the existing fallback chain, weight scale, inherited form typography, and optical sizing. Rename the typeface contract test accordingly. | `index.html`, the body and auth-mode rules in `styles.css`, and `tests/load-inter-typeface.test.js`. | High |
| 3 | Portal styling uses several competing accents, including a fully saturated lime CTA, so the product feels promotional rather than operational. | `styles.css:46`, `styles.css:99-101`, and `styles.css:684-693` distribute lime, navy, and green across the primary action and per-portal card borders; the rendered portals show the lime as a large solid block. Stitch requires one sub-80%-saturation accent. Portal identity is already stated in each `h1`, so the colors do not carry unique meaning. | Add one auth-scoped semantic token, `--color-auth-accent: var(--court)`, and use it for all auth card top borders, auth primary actions, focus indicators, and the session loader. Keep the bright lime in the existing logo artwork only; do not change non-auth screens. | Auth tokens/selectors in `styles.css`, `tests/shell-auth-tokens.test.js`, `tests/one-sign-in-portal-family.test.js`, and session-loading assertions. | High |

## Improve first

Implement finding 1 first. It creates the largest visible change while preserving every product concept and behavior, and it confines the redesign to one coherent surface family.

## Stitch visual brief

### 1. Visual theme and atmosphere

An executive sports-operations entrance: court-night navy, confident asymmetric whitespace, disciplined event energy, and no decorative clutter. Density 5/10, variance 6/10, motion 4/10. It should feel credible on a venue laptop, a scorer tablet, and a participant’s phone.

### 2. Color palette and roles

- **Court-night canvas** (`#00102D`) — full-viewport auth background.
- **Paper surface** (`#FFFFFF`) — form card only.
- **Paddle navy** (`#0A1F54`) — headings and primary text on light surfaces.
- **Slate copy** (`#667085`) — helper text and secondary labels.
- **Court green** (`#3F9B46`) — the single interactive accent for auth CTAs, focus, loader, and structural emphasis.
- **Whisper border** (`rgba(10, 31, 84, 0.12)`) — card and field boundaries.

The lime in the logo remains a brand-image detail, not a second interface accent.

### 3. Typography rules

- **Auth display and body:** Geist with the current 400/600/700/800 weight contract. Signed-in screens retain Inter.
- **Numbers:** inherit the active body family and keep tabular numerals where the existing app requests them; do not introduce a separate numeric font.
- **Headings:** tight but readable, using the current `clamp(1.7rem, 3vw, 2.2rem)` scale.
- **Body:** current `1.5` line height and a maximum readable measure of 42 characters for portal descriptions.

### 4. Component styling

- **Auth card:** keep `--radius-lg`, flat elevation, structural border, and current form order.
- **Primary button:** court-green fill, navy or white foreground only after contrast verification, and the existing tactile pressed transform.
- **Ghost portal buttons:** white surface, subtle border, navy label; no glow and no gradient.
- **Fields:** labels above inputs, validation beneath, current 44 px minimum height, and one court-green focus ring.
- **Loading:** keep the current inline session loader; do not add a new spinner or skeleton system.

### 5. Layout principles

- Desktop: max-width 1120 px, asymmetric two-column grid of roughly 5:4, with the brand/event rail on the left and the unchanged form card on the right.
- The brand rail uses the current white logo and current meta tagline; add only a restrained CSS court-line motif on a pseudo-element. No photographs, overlays, or new assets.
- Below 768 px: one column, logo first, form second, no horizontal scrolling, and 16 px viewport padding.
- Short mobile viewports retain the existing compact rules that keep the primary action visible.

### 6. Motion and interaction

- Keep the existing 160–220 ms motion scale and pressed-state transform.
- Add at most one entrance transition for the brand rail and card using opacity and `translateY`; honor the existing reduced-motion contract.
- No perpetual animation on the sign-in form; the only looping motion remains the active loading indicator.

### 7. Anti-patterns

- No Inter on auth surfaces, pure black, purple, neon glow, gradient card, oversized event headline, three-card layout, custom cursor, overlapping content, invented event data, stock imagery, or new marketing CTA.

## Evidence chain

- Surface: `/`, `/?player=1`, and `/?visitor=1`, rendered by `renderLogin()`.
- Problem: the surface is visually consistent but centered, typographically generic, and over-accented for the requested professional event tone.
- Design evidence: the rendered surface, the current auth contract tests, the semantic auth tokens, and the requested Stitch rules above.
- Owner: `app.js:945-1055`, auth sections in `styles.css`, and the font resource in `index.html`.
- Scope and affected surfaces: the three sign-in portals plus session restoration; signed-in dashboards, Scoreboard, Live Board, Leaderboard, History, Rules, and API behavior are excluded.
- Uncertainty: the Google Stitch MCP server is not exposed as a callable tool in this session, so this brief is written in Stitch-ready semantic form and must be passed to Stitch when that server is available.

## Design decision

Keep the complete sign-in model and convert only its presentation into a restrained, asymmetric company-event entrance. Use one auth accent, one auth sans-serif family, existing brand assets, current copy, and the current responsive/accessibility contracts. This resolves the root visual issue without introducing a parallel component system or changing sign-in behavior.

## Reuse

- Existing semantic tokens: `--surface-auth-shell`, `--surface-panel`, `--border-card`, `--color-heading`, `--color-text-muted`, `--court`, `--radius-lg`, the spacing scale, and the motion scale.
- Existing components: `.auth-card`, `.auth-form`, `.button.primary`, `.button.ghost`, `.input`, `.auth-failure`, and `.session-loading-*`.
- Existing assets: `assets/paddlepoint-logo-w-h.webp`.
- Existing copy exemplar: the metadata tagline in `index.html` and all portal copy in `renderLogin()`.
- New primitives: `--color-auth-accent` and its contrast-paired `--color-on-auth-accent` are justified because the current system has no single auth-only accent; reusing `--color-primary` would unintentionally restyle signed-in surfaces.

## Changes

1. `app.js`
   - Change: group the existing logo inside an `.auth-brand-rail`, add the existing metadata tagline as supporting copy, and keep the current `.auth-card` markup and control order unchanged.
   - Preserve: portal titles, descriptions, fields, submit behavior, portal switching, validation IDs, loading behavior, and focus restoration.
   - Verify: all three portals expose exactly the same form controls and accessible names as before.
2. `styles.css`
   - Change: add the paired auth accent tokens, make `.clean-auth-shell` a contained two-column grid above 768 px, style the brand rail and court-line pseudo-element, route auth accent states through the new tokens, and collapse to the current single-column flow below 768 px.
   - Preserve: dark shell, flat card, existing radius/space/motion tokens, 44 px controls, short-viewport rules, and reduced-motion behavior.
   - Verify: no overlap or horizontal scroll at 390, 768, 1024, and 1440 px; primary action stays visible at 390 × 700.
3. `index.html`
   - Change: request Geist alongside the existing Inter family and increment the existing stylesheet cache-busting suffix.
   - Preserve: Inter on signed-in screens, preconnects, `display=swap`, metadata, asset paths, and script order.
   - Verify: the font request precedes `styles.css` and the system fallback works with the network font blocked.
4. `tests/load-inter-typeface.test.js`
   - Change: rename to `tests/load-geist-typeface.test.js` and update only the family/link/stack assertions.
   - Preserve: preconnect, swap, cache-busting, optical sizing, inheritance, and offline fallback assertions.
   - Verify: the renamed test passes directly with Node.
5. `tests/one-sign-in-portal-family.test.js` and `tests/shell-auth-tokens.test.js`
   - Change: assert the brand rail, asymmetric desktop grid, single-column mobile branch, and one auth accent token; replace the old per-portal border-color assertions.
   - Preserve: all copy, control, focus, validation, loading, logo, and short-viewport checks.
   - Verify: all auth contract tests pass without weakening behavior assertions.

## Scope

- Inherit: Admin, Player, Visitor, and session-loading auth states.
- Verify: body auth-mode background, portal switching focus, field error states, offline font fallback, and short mobile height.
- Exclude: authenticated app shell, navigation, dashboards, Scoreboard, Tournament workflows, Live Board, analytics, PHP APIs, database files, and all current unrelated working-tree changes.

## Validation

- Product: open each portal, switch among all three, submit empty forms, and confirm the same fields, copy, focus, and errors remain.
- Interface: compare 1440 × 900, 1024 × 768, 768 × 1024, 390 × 844, and 390 × 700; check idle, focused, invalid, pending, and session-restoring states.
- System: confirm every auth accent resolves through `--color-auth-accent` and that no second auth-only layout or button primitive was added.
- Repository: `node --test tests/load-geist-typeface.test.js tests/one-sign-in-portal-family.test.js tests/shell-auth-tokens.test.js tests/interaction-motion-states.test.js tests/numeric-and-layout-finishing.test.js` → all tests pass.

## Stop conditions

- Stop if the existing logo or tagline is not approved for the event, if the sign-in portal family must carry a separate Qlik visual identity, or if implementing the grid requires changing authentication behavior or authenticated screens.

## Design documentation

- After acceptance and validation: record the auth-only asymmetric layout, Geist family, and `--color-auth-accent` ownership in the repository’s governing design documentation if one is later adopted; otherwise none.
