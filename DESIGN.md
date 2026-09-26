# Design System: PaddlePointer Sign-In Portals

This document governs the Admin, Player, Visitor, and session-restoration entry surfaces. It preserves PaddlePointer's existing identity, copy, behaviors, and brand assets.

## 1. Visual Theme & Atmosphere

An executive sports-operations entrance with a court-night canvas, offset asymmetric composition, balanced daily-app density, and restrained interaction motion. The brand rail carries the event energy; the form remains quiet and operational.

- **Density:** 5/10, balanced for venue laptops, scorer tablets, and participant phones.
- **Variance:** 6/10, asymmetric on desktop and strictly single-column below 768px.
- **Motion:** 4/10, tactile control feedback with no decorative loops.

## 2. Color Palette & Roles

- **Court-night Canvas** (`#00102D`) - Full-viewport authentication background.
- **Paper Surface** (`#FFFFFF`) - Form card and input surfaces.
- **Paddle Navy** (`#0A1F54`) - Headings and strong text on light surfaces.
- **Charcoal Copy** (`#111827`) - Body text and readable text on Court Green.
- **Slate Copy** (`#667085`) - Supporting copy and metadata.
- **Whisper Border** (`rgba(10, 31, 84, 0.12)`) - Card and field structure.
- **Court Green** (`#3F9B46`) - The only auth interface accent, used for primary actions, focus, loading, and structural emphasis.

The brighter lime remains inside the official logo artwork only. It is not a second interface accent.

## 3. Typography Rules

- **Auth display and body:** Geist, using weights 400, 600, 700, and 800. Signed-in product screens retain Inter.
- **Fallback:** `ui-sans-serif`, `system-ui`, `-apple-system`, `BlinkMacSystemFont`, `Segoe UI`, `sans-serif`.
- **Headlines:** Track-tight, controlled scale, and weight-led hierarchy. The brand statement uses `clamp(2.7rem, 5vw, 4.8rem)` only on desktop.
- **Body:** Relaxed 1.5 line height with a 42-character measure for portal descriptions.
- **Numbers:** Keep existing tabular-number rules. No separate mono family is needed on this low-density surface.

## 4. Component Stylings

- **Brand rail:** A quiet navy surface with structural court lines, the official white logo, and the existing product promise.
- **Auth card:** Flat white surface, 12px radius, structural border, and a 3px Court Green top rule. No glow or gradient.
- **Buttons:** Court Green primary action with Charcoal Copy, existing `scale(0.96)` press feedback, and no layout shift. Ghost actions remain white with a subtle border.
- **Inputs:** Visible label above, helper or error below, 44px minimum height, and Court Green focus indication.
- **Loading:** Keep the existing session and button loading indicators. Do not add another loading pattern.

## 5. Layout Principles

- Desktop uses a contained 1120px two-column grid: 1.05fr brand rail and 0.95fr form card.
- Every element stays in normal document flow. Text never overlaps controls or imagery.
- Below 768px the surface becomes one column, centered within 560px, with 16px viewport padding and no horizontal scrolling.
- Short mobile viewports hide the supporting brand statement so the primary action remains visible.
- Keep the current field order, form names, portal labels, URLs, focus behavior, and validation IDs.

## 6. Motion & Interaction

- Reuse the existing 160-220ms interaction scale.
- Animate only color, shadow, opacity, or transform.
- Keep press feedback at `scale(0.96)`.
- Do not add page-load choreography or perpetual animation to the form.
- Respect `prefers-reduced-motion`; loading state remains legible without rotation.

## 7. Anti-Patterns (Banned)

- No Inter on auth surfaces, generic serif, pure black, purple, neon glow, gradient cards, or oversaturated auth controls.
- No centered desktop hero, overlapping content, stock imagery, new marketing CTA, or invented event data.
- No three-card feature rows, custom cursors, emojis, filler scroll cues, or AI copywriting clichés.
- No changes to portal concepts, field order, authentication behavior, navigation vocabulary, logo proportions, or signed-in product surfaces.

## 8. Signed-In Staff Analytics

The Staff Dashboard and Analytics view use the signed-in product system, not the
auth-only Geist treatment above. Their job is operational: help staff read event
performance quickly, narrow governed Qlik data, and open Qlik Cloud only for deeper
exploration.

- **Typography:** Inter remains the only signed-in family. Use weight and scale for
  hierarchy; metrics use tabular numerals.
- **Canvas:** Keep the existing page, panel, border, spacing, radius, motion, and
  elevation tokens. Routine analytics panels stay flat; do not add gradients, glows,
  or a parallel card system.
- **Score strip:** One dominant KPI uses Paddle Navy with a 3px Court Green structural
  rule and light text. Supporting KPIs use the soft page surface. Keep one KPI band to
  four values maximum.
- **Subjects:** The six Analytics subjects are presented as one horizontally scrollable
  subject rail on compact widths. The active state has a static color/border cue and
  keyboard focus remains visible.
- **Charts and tables:** Court Green and Paddle Navy carry the data marks. Reduce
  non-data ink, keep object titles when they name a chart, and retain exact values in
  the existing data tables.
- **Composition:** The Dashboard card owns the title of its single chart. The
  Analytics page owns the active subject heading and description; charts do not repeat
  that page heading.
- **Motion:** Reuse the existing 160–220ms interaction scale, transition exact
  properties, keep press feedback at `scale(0.96)`, and respect reduced motion.
