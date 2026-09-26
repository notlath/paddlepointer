# Plan 001: The Scoreboard's rally buttons are on screen without scrolling on laptops and landscape tablets

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git log --oneline -1` must show a commit at or after
> `accaf45`, and `git status --short styles.css` must be empty (the in-progress Live
> Board revamp is committed — see plans/README.md "Prerequisite"). Then run the
> excerpt checks in "Current state"; any mismatch is a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none (only the README prerequisite)
- **Category**: bug (UX/layout)
- **Planned at**: commit `accaf45` + uncommitted `dev` working tree, 2026-09-23

## Why this matters

The Scoreboard is the screen a scorer uses for every rally. Its primary controls,
the two "<Team> wins rally" buttons, sit at the bottom of each team tile. On any
screen wider than 980px the three-column layout stretches every tile to the height
of the center "court board" column (846px), so the rally buttons render at
y≈994px. Measured in a browser: at 1024×768, 1366×768 and 1440×900 the buttons are
fully **below the fold**, so a courtside scorer on a laptop or landscape tablet
must scroll before every tap. Separately, the court diagram's team labels are
clipped to "Te… / Ser…" between 981px and ~1440px wide. Phones (≤980px) are
already fine and must not change.

## Current state

Files:
- `styles.css` — single stylesheet. Section `07. SCOREBOARD & COURT UI` starts at the
  comment block containing `07. SCOREBOARD & COURT UI` and ends right before the one
  containing `08. HISTORY, SHARING & LEADERBOARD`.
- `app.js` — renders the Scoreboard in `renderScoreboard()`, `renderTeamTile()`,
  `renderCourtBoard()`, `renderCourtSide()`. **No markup change is needed.**

Excerpts (confirm each with the grep shown; each must print exactly the count noted):

```css
/* styles.css, section 07 — grep -c "grid-template-columns: minmax(0, 1fr) minmax(300px, 0.92fr) minmax(0, 1fr);" styles.css  → 1 */
.scoreboard {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(300px, 0.92fr) minmax(0, 1fr);
  gap: var(--space-4);
  align-items: stretch;
}

.score-tile {
  position: relative;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  min-height: 510px;          /* grep -c "  min-height: 510px;" styles.css → 2 (.score-tile and .court-board) */
  ...
}

.score-number {
  display: grid;
  min-height: 210px;
  place-items: center;
  ...
  font-size: var(--display-digits-scoreboard);   /* token = clamp(6rem, 17vw, 12rem) */
  ...
}

.court-board {
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  min-height: 510px;
  ...
}

.court-team-label {
  position: absolute;
  ...
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2);
  min-height: 30px;
  ...
}

.court-team-label strong,
.court-team-label span {        /* grep -c "^.court-team-label strong,$" styles.css → 1 */
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
```

The last rules in section 07 are:

```css
.score-controls .button {
  min-height: 46px;
  padding: 0 10px;
}
```

followed by the `08. HISTORY, SHARING & LEADERBOARD` comment block. That gap is where
the new rule block goes.

Measured cause (1366×768): each team tile's own content is ~460px
(head 70 + score 210 + players/timeout 93 + rally 86), but the center column is
833px (score call 120 + serve position 155 + court diagram 309 + meta list and
controls 249). With `align-items: stretch` the tiles grow to 846px and
`justify-content: space-between` pins the rally button to the bottom.

Phone and portrait-tablet behavior lives in `@media (max-width: 980px)` blocks
(one-column layout, `body.scoreboard-mode` rules). Leave all of those alone.

Repo conventions that the new CSS must follow (enforced by tests):
- `tests/stylesheet-contract.test.js`: `gap`, `font-size`, `font-weight`,
  `border-radius`, `box-shadow`, `z-index` values that equal a token must use the
  token (e.g. `gap: 0` is fine, `gap: 8px` must be `var(--space-2)`).
- `tests/match-court-tokens.test.js`: rules for scoreboard/court selectors must not
  contain raw hex/rgba colors. This plan adds no colors.
- `tests/court-styles.test.js`: each court selector (e.g. `.court-team-label`) has
  exactly **one top-level** rule. Rules inside `@media` do not count — so put the
  new label rule inside the media block, never as a second top-level rule.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Browser tests | `node --test` | `pass` ≥ 414; the only failures are the 5 baseline failures listed below |
| One file | `node --test tests/mobile-scoreboard.test.js tests/court-styles.test.js tests/focused-scoreboard.test.js tests/match-court-tokens.test.js tests/stylesheet-contract.test.js` | all pass |
| Serve locally | `php -S 127.0.0.1:8000 -t .` (PowerShell; PHP comes from Laravel Herd) | server listening |

Baseline failures that exist before this plan (do not try to fix them):
`every corner comes from the named radius scale`,
`the strongest elevation is reserved for floating content and the Match being scored`,
`remaining styles for tournament, records, and people reference semantic tokens instead of original brand variables or raw colors`,
`missing roles for tournament, records, buttons, and interaction states have named semantic tokens`,
`a search of the stylesheet finds no remaining references to the original brand variables outside the token definitions, and no raw colors outside the token definitions`.
Record the exact failing list from your own first run and compare against it at the end.

## Scope

**In scope**:
- `styles.css` — add one `@media (min-width: 981px)` block at the end of section 07.
- `tests/scoreboard-desktop-fit.test.js` (create).

**Out of scope** (do NOT touch):
- `app.js` markup — the fix is CSS-only; do not reorder the tile's children.
- Any `@media (max-width: 980px)` / `body.scoreboard-mode` rule — phone layout is
  already correct and has its own tests (`tests/mobile-scoreboard.test.js`).
- The `--display-digits-scoreboard` token itself — other layouts may use it.
- Live Board / TV mode rules (sections 09–10) — separate in-progress work.

## Git workflow

- Branch: `advisor/001-scoreboard-desktop-fit` from `dev`.
- One commit. Message style from `git log` (imperative, sentence case, no prefix),
  e.g. `Keep rally buttons on screen on laptops`.
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Add the desktop fit block to section 07

Insert, directly after the `.score-controls .button { … }` rule and before the
`08. HISTORY, SHARING & LEADERBOARD` comment block:

```css
/* Three-column Scoreboard: each column keeps its own height so the rally buttons
   stay on screen at laptop and landscape-tablet heights; digits scale with height. */
@media (min-width: 981px) {
  .scoreboard {
    align-items: start;
  }

  .score-tile,
  .court-board {
    min-height: 0;
  }

  .score-number {
    min-height: 0;
    font-size: min(var(--display-digits-scoreboard), 22vh);
  }

  .court-team-label {
    flex-direction: column;
    align-items: flex-start;
    gap: 0;
  }
}
```

Why each line: `align-items: start` stops the center column from stretching the
tiles; the `min-height: 0` lines remove the fixed 510px/210px floors; `22vh` caps
the digit size on short screens (measured: 1366×657 → 145px digits, button bottom
at 645px); the stacked label gives "Team A" and "Serving" the full label width.

**Verify**: `node --test tests/court-styles.test.js tests/match-court-tokens.test.js tests/stylesheet-contract.test.js tests/mobile-scoreboard.test.js`
→ same pass/fail as your baseline for these files (stylesheet-contract has no
new failures; the other three pass).

### Step 2: Add a regression test

Create `tests/scoreboard-desktop-fit.test.js`, modeled on the CSS-parsing style of
`tests/mobile-scoreboard.test.js` (read that file first; it reads `styles.css`
with `fs.readFileSync` and matches media blocks with regexes). Assert:

1. There is an `@media (min-width: 981px)` block containing `.scoreboard` with
   `align-items: start`.
2. The same block sets `min-height: 0` for `.score-tile` and `.court-board`.
3. The same block sets `.score-number` `font-size` to a `min(` expression that
   contains `var(--display-digits-scoreboard)` and a `vh` value.
4. The same block sets `.court-team-label` `flex-direction: column`.

Tip: several `@media (min-width: 981px)` blocks exist in the file; find the one
whose body contains `.scoreboard` (e.g. collect all matches of
`/@media\s*\(min-width:\s*981px\)\s*\{([\s\S]*?)\n\}/g` and pick the one that
includes `.scoreboard`).

**Verify**: `node --test tests/scoreboard-desktop-fit.test.js` → 4 (or however many
you wrote) pass, 0 fail.

### Step 3: Measure in a real browser

Use `plans/tools/preview-harness.js` (read its header comment for usage):
1. `php -S 127.0.0.1:8000 -t .`
2. Open `http://127.0.0.1:8000/DESIGN.md?view=setup`, run the harness, wait 2s, run
   `startDemoMatch()`, wait 1s. (If a "Continue this match?" dialog appears, click
   "Continue Match".)
3. For each viewport below, set the window/viewport size, scroll to top, and run:

```js
scrollTo(0, 0);
const b = document.querySelector('.rally-btn').getBoundingClientRect();
({ w: innerWidth, h: innerHeight, rallyBottom: Math.round(b.bottom),
   clippedLabels: [...document.querySelectorAll('.court-team-label strong, .court-team-label span')]
     .filter(e => e.scrollWidth > e.clientWidth + 1).length,
   overflowX: document.documentElement.scrollWidth - innerWidth })
```

**Verify** (expected, measured by the advisor with the same CSS):

| Viewport (inner) | rallyBottom must be | clippedLabels | overflowX |
|---|---|---|---|
| 1024×690 | ≤ 690 (≈653) | 0 | ≤ 0 |
| 1366×657 | ≤ 657 (≈645) | 0 | ≤ 0 |
| 1440×789 | ≤ 789 (≈706) | 0 | ≤ 0 |
| 1920×969 | ≤ 969 (≈724) | 0 | ≤ 0 |
| 390×844 (phone) | identical to your pre-change measurement (take one before Step 1) | 0 | 0 |

Before the change, rallyBottom was ≈1080 at 1366×657 — that is the bug.
Then run `clearPreviewHarness()`.

### Step 4: Full suite

**Verify**: `node --test` → failures are exactly the baseline list; pass count
= baseline pass + your new tests.

## Test plan

- New: `tests/scoreboard-desktop-fit.test.js` (Step 2) — guards the four declarations.
- Existing tests that must stay green: `mobile-scoreboard`, `court-styles`,
  `focused-scoreboard`, `match-court-tokens`, `score-highlight`.
- Manual/browser measurement table in Step 3 is the behavioral check.

## Done criteria

- [x] `node --test tests/scoreboard-desktop-fit.test.js` exits 0
- [x] `node --test` failures == baseline list (no new failures)
- [x] Step 3 table: every rallyBottom ≤ innerHeight at the four desktop sizes; phone unchanged; 0 clipped labels
- [x] `git status --short` shows only `styles.css` and `tests/scoreboard-desktop-fit.test.js` (plus `plans/README.md`)
- [x] `plans/README.md` status row updated

## STOP conditions

- Any excerpt grep in "Current state" returns a different count.
- After Step 1, rallyBottom at 1366×657 is still > 657 — report the measured
  heights of `.page-title`, `.team-head`, `.score-number`, `.team-meta`, `.rally-btn`
  instead of shrinking other things on your own.
- A test outside the baseline list starts failing and the fix would need a change
  outside `styles.css`.
- The phone measurement (390×844) changes.

## Maintenance notes

- The center column (score call, serve position, court, meta list, Correct Serve /
  Undo / End Match / Reset) is now allowed to be taller than the team tiles on
  desktop; its lower controls may need a scroll on short laptops. That is the
  intended trade: the rally buttons are used every point, the lower controls rarely.
  If product wants every control above the fold, the next step is moving
  `.board-meta` under the three columns — a markup change, not in this plan.
- Reviewers: check the new block is inside section 07, uses no raw colors, and
  that no top-level `.court-team-label` rule was duplicated.
