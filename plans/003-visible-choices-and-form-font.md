# Plan 003: Selected choices are clearly visible and every form field uses the app font

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

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none (only the README prerequisite)
- **Category**: bug (accessibility / polish)
- **Planned at**: commit `accaf45` + uncommitted `dev` working tree, 2026-09-23

## Why this matters

Three small defects make forms look unfinished and make choices hard to read:

1. **Segmented choices barely show which option is selected.** New Match (Singles /
   Doubles, first server, right-court player, 11/15/21) and the confirmation-dialog
   choices use `.segmented` / `.segment`. The selected segment is white
   (`--surface-panel`) on a `#f5f7fa` track: a 1.07:1 difference, plus a heavier font
   weight and a faint shadow. WCAG 1.4.11 asks for 3:1 for state indicators.
2. **The People "Role" picker has no track at all.** It uses `.segment-row`, which
   is just a flex row, so the selected option is white on the white panel: only
   the bold weight shows which role is chosen.
3. **The Tournament "Registered players" textarea renders in the browser's
   monospace font.** The global form reset covers `button, input, select` but not
   `textarea`, and `.textarea` sets no font.

## Current state

Files: `styles.css` (single stylesheet), `app.js` (string-template renderer).

Greps (each must print the count shown):

```text
grep -c "^select {" styles.css                        → 1   (end of the "button,\ninput,\nselect {" reset, section 01)
grep -c "^.segment.active {" styles.css               → 1
grep -c "^.segment-row {" styles.css                  → 1
grep -c 'class="segment-row"' app.js                  → 1   (People → Create account → Role)
grep -c 'class="segmented' app.js                     → 5   (setup ×4 + confirmation dialog ×1)
```

Current CSS:

```css
/* section 01 */
button,
input,
select {
  font: inherit;
  letter-spacing: 0;
}

/* section 06 */
.segmented {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 6px;
  min-height: 48px;
  padding: 4px;
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-md);
  background: var(--surface-page);
}

.segment.active {
  background: var(--surface-panel);
  box-shadow: var(--elevation-1);
  font-weight: var(--font-weight-extrabold);
}

/* section 04 area */
.segment-row {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
}
```

Current People markup (`app.js`, inside the Create account form):

```html
<fieldset class="field choice-group">
  <legend class="label">Role</legend>
  <div class="segment-row">
    <label class="segment ${form.role === "player" ? "active" : ""}">
      <input type="radio" name="new-user-role" value="player" data-user-role…>
      Player
    </label>
    <label class="segment ${form.role === "admin" ? "active" : ""}">
      …Admin
    </label>
  </div>
</fieldset>
```

Constraints enforced by existing tests (read these tests before editing):
- `tests/clean-state-cues.test.js` requires `.segment.active` to keep
  `font-weight: var(--font-weight-extrabold)` and a `background:` of
  `var(--surface)` or `var(--surface-panel)`, and no underline. Keep both.
- `tests/restrained-elevation.test.js` requires `.segment` radius + `.segmented`
  padding = `.segmented` radius. Do not change radii or padding.
- `tests/stylesheet-contract.test.js`: a `box-shadow` equal to an elevation token
  must use the token; `gap` equal to a space token must use it.
- `tests/match-court-tokens.test.js`: segment/segmented rules may not contain raw
  hex/rgba colors — use tokens only.

## Commands you will need

| Purpose | Command | Expected |
|---|---|---|
| Focused tests | `node --test tests/clean-state-cues.test.js tests/restrained-elevation.test.js tests/match-court-tokens.test.js tests/stylesheet-contract.test.js tests/interaction-motion-states.test.js tests/account-form-errors.test.js` | same as your baseline run of these files |
| All browser tests | `node --test` | failures == baseline list (5 stylesheet-token tests, see plans/README.md) |
| Serve | `php -S 127.0.0.1:8000 -t .` | listening |

## Scope

**In scope**: `styles.css` (three rules), `app.js` (one class name),
`tests/visible-choices.test.js` (create).

**Out of scope**:
- `.live-board-tab` and `.side-nav-item` selected states — they already use the lime
  fill and have their own tests.
- Radio input semantics (`label.segment` + hidden radio) — already accessible; do not
  change the markup structure.
- `.textarea` colors/borders (a separate token-migration ticket covers the raw
  `#bdc9d8` / `#fff` there).

## Git workflow

Branch `advisor/003-visible-choices`, one commit, e.g. `Make selected choices and
textareas read clearly`. No push/PR unless instructed.

## Steps

### Step 1: Give textareas the app font

Change the section-01 reset selector from `button,\ninput,\nselect {` to:

```css
button,
input,
select,
textarea {
  font: inherit;
  letter-spacing: 0;
}
```

**Verify** (browser, harness `view=tournament`, see Step 4 for harness use):
`getComputedStyle(document.querySelector('textarea')).fontFamily` starts with `Inter`.

### Step 2: Outline the selected segment

Replace the `.segment.active` rule with:

```css
.segment.active {
  background: var(--surface-panel);
  box-shadow: inset 0 0 0 2px var(--color-heading);
  font-weight: var(--font-weight-extrabold);
}
```

The 2px inset Paddle Navy ring gives a >3:1 boundary against the `#f5f7fa` track
without changing size (inset shadows do not affect layout) and keeps the white fill
the clean-state test requires.

**Verify**: `node --test tests/clean-state-cues.test.js tests/restrained-elevation.test.js tests/stylesheet-contract.test.js` → no new failures.

### Step 3: Put the People Role picker on the shared track

In `app.js` change `<div class="segment-row">` to `<div class="segmented">` (the
Role picker is the only consumer). Then delete the now-unused `.segment-row { … }`
rule from `styles.css`.

**Verify**: `grep -c "segment-row" app.js styles.css` → `app.js:0` and `styles.css:0`.

### Step 4: Check in the browser

Use `plans/tools/preview-harness.js` (read its header). Boot `view=setup`, then:

```js
const a = document.querySelector('label.segment.active'); const c = getComputedStyle(a);
[c.boxShadow, c.backgroundColor]   // expect an inset 2px rgb(10, 31, 84) shadow and rgb(255, 255, 255)
```

Boot `view=people`: the Role picker now shows a grey track with Player and Admin as
two equal segments, the selected one white with a navy ring. Click "Admin" and
confirm the ring moves (the radio change handler is unchanged). At 390px wide the
two segments stay side by side with no horizontal overflow
(`document.documentElement.scrollWidth === innerWidth`). Run `clearPreviewHarness()`.

### Step 5: Regression test

Create `tests/visible-choices.test.js` (model on `tests/clean-state-cues.test.js`'s
CSS-reading helpers). Assert:
1. The global reset rule selector includes `textarea` alongside `button`, `input`, `select` with `font: inherit`.
2. `.segment.active` has a `box-shadow` containing `inset` and `var(--color-heading)`.
3. `app.js` contains no `segment-row`, and the `new-user-role` radios sit inside a `class="segmented"` container.

**Verify**: `node --test tests/visible-choices.test.js` → all pass; `node --test` → failures == baseline.

## Test plan

New `tests/visible-choices.test.js` (Step 5); existing tests listed in Commands must
not regress; browser checks in Step 4.

## Done criteria

- [ ] `grep -c "segment-row" app.js styles.css` → 0 and 0
- [ ] `node --test tests/visible-choices.test.js` exits 0
- [ ] `node --test` failures == baseline list
- [ ] Textarea computed font family starts with `Inter` (Step 1 check)
- [ ] Only `app.js`, `styles.css`, the new test and `plans/README.md` modified

## STOP conditions

- A grep count in "Current state" differs.
- `tests/clean-state-cues.test.js` or `tests/restrained-elevation.test.js` fails
  because of your change and passing it would need a different fill or radius —
  report instead of changing the tests.
- The Role picker's `.segmented` grid breaks the People form layout (e.g. overlaps
  the "Player password" box) — report with a screenshot.

## Maintenance notes

- `.segmented` is now the only segmented-choice container; new pickers should use
  it, not a bare flex row.
- If a future design wants selected segments filled lime like Live Board tabs, change
  `.segment.active` and `tests/clean-state-cues.test.js` together.
