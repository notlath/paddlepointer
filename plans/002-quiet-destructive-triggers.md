# Plan 002: Buttons that start a destructive action are quiet; solid red is reserved for the final confirm

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git status --short app.js styles.css` must be empty
> (the in-progress Live Board revamp is committed — see plans/README.md
> "Prerequisite"). Then run every grep in "Current state"; any count mismatch is a
> STOP condition.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none (only the README prerequisite)
- **Category**: tech-debt (UX consistency)
- **Planned at**: commit `accaf45` + uncommitted `dev` working tree, 2026-09-23

## Why this matters

Three buttons that wipe data are painted solid red at the same size and weight as
the primary action next to them:

- **Reset Tournament** sits beside **Generate Schedule** in the Tournament form.
- **Reset** sits in the Scoreboard controls beside Undo and End Match.
- **Reset Match** sits beside **Continue Match** in the "Continue this match?"
  recovery dialog that appears after a page refresh. This one resets the score to
  0-0 **immediately** with no second confirmation.

A solid red button signals "this is the important action", which pulls attention
and taps toward the destructive choice. The app already has the right pattern in one
place: **Clear Local Cache** in History is a normal outlined (ghost) button with red
text (`.button.history-clear`). This plan makes that the single "quiet danger"
style for every button that *starts* a destructive action, and keeps solid red
(`.button.danger`) only for the final confirm button inside the shared destructive
confirmation dialog (`renderDestructiveConfirmation()` in `app.js`), where the
decision is actually made.

## Current state

Files:
- `app.js` — string-template renderer for every screen.
- `styles.css` — single stylesheet, numbered sections. Section `03. SHARED LAYOUT,
  HERO & BUTTONS` holds the button variants; section `27. SHARED INTERACTION &
  MOTION STATES` holds hover rules inside `@media (hover: hover)`.

Exact strings to find (each grep must print the count shown):

```text
grep -c 'class="button danger" data-action="reset-recovered-match"' app.js            → 1   (recovery dialog, renderMatchRecovery…)
grep -c 'class="button danger" data-action="reset-active"' app.js                     → 1   (Scoreboard controls, renderCourtBoard)
grep -c 'class="button danger" type="button" data-action="reset-tournament"' app.js   → 1   (Tournament form)
grep -c 'class="button ghost history-clear" data-action="clear-history"' app.js       → 1   (History header)
grep -c '^.button.history-clear {' styles.css                                          → 1
```

Current CSS (styles.css):

```css
/* section 03 */
.button.danger {
  color: #fff;
  background: var(--danger);
}

.button.ghost {
  color: var(--navy);
  border-color: var(--line);
  background: var(--surface);
}

/* section 08 */
.button.history-clear {
  color: var(--color-danger-text);
}

/* section 27, inside @media (hover: hover) */
  .button.ghost:hover:not(:disabled) {
    background: var(--soft);
    border-color: #bdc9d8;
  }
```

Existing tokens to reuse (defined in the single `:root`, do not add new ones):
`--color-danger-text` (#a32020), `--border-danger`, `--surface-danger`.

Keep as they are (these ARE the final decision and stay solid red):
- `renderDestructiveConfirmation()` — the two lines rendering
  `class="button danger" data-action="confirm-destructive-confirmation"` and
  `class="button ${confirmation.tone === "choice" ? "green" : "danger"}"`.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Browser tests | `node --test` | only the 5 baseline failures (see below) |
| Focused tests | `node --test tests/destructive-confirmation.test.js tests/interaction-motion-states.test.js tests/history-actions.test.js tests/stylesheet-contract.test.js tests/mobile-scoreboard.test.js` | same results as your baseline run of these files |
| Serve locally | `php -S 127.0.0.1:8000 -t .` | server listening |

Baseline failures before this plan (leave them alone): the five tests named
`every corner comes from the named radius scale`, `the strongest elevation is
reserved for floating content and the Match being scored`, `remaining styles for
tournament, records, and people reference semantic tokens…`, `missing roles for
tournament, records, buttons, and interaction states have named semantic tokens`,
`a search of the stylesheet finds no remaining references to the original brand
variables…`. Record your own first-run failing list and compare at the end.

## Scope

**In scope**:
- `app.js` — the four button class strings listed above.
- `styles.css` — rename `.button.history-clear` to `.button.quiet-danger`, move it into
  section 03, add one hover rule in section 27.
- `tests/quiet-destructive-triggers.test.js` (create).

**Out of scope**:
- `renderDestructiveConfirmation()` buttons — stay solid.
- `End Match` (`class="button warn"`) — ending a match is a normal end-of-play step, not a data wipe.
- Any handler logic (`resetRecoveredMatch`, `resetActiveGame`, `resetTournament`,
  `clearHistory`). Do not add or remove confirmations.
- The `.button.danger` rule itself — still used by the confirm dialog.

## Git workflow

- Branch `advisor/002-quiet-destructive-triggers` from `dev`; one commit, e.g.
  `Quiet the buttons that start a reset`. No push/PR unless instructed.

## Steps

### Step 1: Rename the CSS class and move it next to the other variants

In `styles.css`:
1. Delete the section-08 rule `.button.history-clear { color: var(--color-danger-text); }`.
2. In section 03, directly after the `.button.ghost { … }` rule, add:

```css
/* Starts a destructive action; the confirmation dialog owns the solid red decision. */
.button.quiet-danger {
  color: var(--color-danger-text);
}
```

3. In section 27, inside `@media (hover: hover)`, directly after the
   `.button.ghost:hover:not(:disabled) { … }` rule, add:

```css
  .button.quiet-danger:hover:not(:disabled) {
    border-color: var(--border-danger);
    background: var(--surface-danger);
  }
```

(It must come after the ghost hover rule so it wins at equal specificity.)

**Verify**: `grep -c "history-clear" styles.css` → 0; `grep -c "\.button\.quiet-danger" styles.css` → 2.

### Step 2: Switch the four trigger buttons

In `app.js` replace exactly:

| Find | Replace with |
|---|---|
| `class="button danger" data-action="reset-recovered-match"` | `class="button ghost quiet-danger" data-action="reset-recovered-match"` |
| `class="button danger" data-action="reset-active"` | `class="button ghost quiet-danger" data-action="reset-active"` |
| `class="button danger" type="button" data-action="reset-tournament"` | `class="button ghost quiet-danger" type="button" data-action="reset-tournament"` |
| `class="button ghost history-clear" data-action="clear-history"` | `class="button ghost quiet-danger" data-action="clear-history"` |

Do not change labels, attributes, or order.

**Verify**:
- `grep -c 'quiet-danger' app.js` → 4
- `grep -c 'history-clear' app.js` → 0
- `grep -c 'class="button danger"' app.js` → 1 (only the destructive confirmation's multi-choice button)

### Step 3: Regression test

Create `tests/quiet-destructive-triggers.test.js` following the file-reading style of
`tests/history-actions.test.js` (read it first). Assert:
1. For each of `reset-recovered-match`, `reset-active`, `reset-tournament`,
   `clear-history`: the button markup in `app.js` has class `button ghost quiet-danger`
   (regex on `class="button ghost quiet-danger"[^>]*data-action="<action>"`).
2. `app.js` still renders `data-action="confirm-destructive-confirmation"` with class
   `button danger` (solid red is kept for the decision).
3. `styles.css` declares `.button.quiet-danger` with `color: var(--color-danger-text)`
   and contains no `history-clear`.

**Verify**: `node --test tests/quiet-destructive-triggers.test.js` → all pass.

### Step 4: Look at it

With `plans/tools/preview-harness.js` (see its header): boot `view=tournament` and
confirm "Reset Tournament" renders as a white button with red text next to the lime
"Generate Schedule"; run in the console:

```js
const b = document.querySelector('[data-action="reset-tournament"]'); const c = getComputedStyle(b);
[c.backgroundColor, c.color]   // expect ["rgb(255, 255, 255)", "rgb(163, 32, 32)"]
```

Click it and confirm the existing confirmation dialog still opens with a solid red
"Reset Open Play" button; press Escape/Cancel. Then `clearPreviewHarness()`.

### Step 5: Full suite

**Verify**: `node --test` → failures equal the baseline list.

## Test plan

- New `tests/quiet-destructive-triggers.test.js` (Step 3).
- Existing: `destructive-confirmation`, `interaction-motion-states`, `history-actions`,
  `stylesheet-contract`, `mobile-scoreboard` must not regress.

## Done criteria

- [ ] `grep -c 'quiet-danger' app.js` → 4 and `grep -c 'history-clear' app.js styles.css` → 0 for both files
- [ ] `node --test tests/quiet-destructive-triggers.test.js` exits 0
- [ ] `node --test` failures == baseline list
- [ ] `git status --short` lists only `app.js`, `styles.css`, the new test, `plans/README.md`

## STOP conditions

- Any grep count in "Current state" differs.
- A test asserts the old `history-clear` class or a solid `button danger` on one of
  the four triggers — report it; do not edit unrelated tests to force a pass.
- The hover rule is overridden in the browser (red text but grey hover) — report
  which rule wins rather than adding `!important`.

## Maintenance notes

- New rule of thumb for reviewers: a button that *opens* a destructive decision uses
  `button ghost quiet-danger`; only the confirm button *inside*
  `renderDestructiveConfirmation()` uses `button danger`.
- The recovery dialog's Reset Match still resets immediately (no second confirm).
  That behavior is unchanged here; if mis-taps are reported, route it through
  `requestDestructiveConfirmation()` like the Scoreboard Reset.
