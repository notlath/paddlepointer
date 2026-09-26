# Plan 004: Tournament setup opens on its configuration; "Start a new Event" is a separate, collapsed step

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
- **Effort**: M
- **Risk**: MED (touches a Super Admin workflow; behavior must not change)
- **Depends on**: none (plan 002 touches the Reset Tournament button's class in the
  same function; either order works, re-run the drift greps if 002 landed first)
- **Category**: tech-debt (UX / information architecture)
- **Planned at**: commit `accaf45` + uncommitted `dev` working tree, 2026-09-23

## Why this matters

The Tournament page's "Set up Tournament" card starts with a *different* form: a
"New Event name" + "Courts to use" + "Start New Event" mini-form that switches the
workspace to a brand-new Event. Directly below it is the real configuration form,
which has its own "Tournament name" and a second **"Courts to use"** field. A Super
Admin opening the page sees two name fields and two identical "Courts to use"
labels before any explanation of which is which. Starting a new Event happens once per
event day; configuring the current one happens constantly. This plan moves the
new-Event form into a collapsed "Start a new Event" disclosure at the end of the
card, gives its fields unambiguous labels, and keeps its behavior identical.

## Current state

Files:
- `app.js` — `renderTournament()` builds `const workspace = \`…\`` containing, for
  Super Admins, `<article class="panel tournament-configuration">`. Handlers:
  `startNewEvent()`; the input handler at `app.addEventListener("input", …)` has a
  `[data-start-event-field]` branch; the click handler routes
  `action === "start-new-event"` to `startNewEvent()`.
- `styles.css` — section `11. TOURNAMENT MANAGEMENT` has `.tournament-configuration`
  and `.format-estimate > summary` rules.

Greps (each must print the count shown):

```text
grep -c 'data-start-event-form novalidate' app.js                 → 1
grep -c '<span class="label">New Event name</span>' app.js         → 1
grep -c 'data-start-event-field="courts"' app.js                  → 1
grep -c '${renderTournamentPlayerCreator()}' app.js               → 1
grep -c 'const defaultStartEventForm = {' app.js                  → 1
grep -c '^.tournament-configuration {' styles.css                 → 1
```

Current markup (inside the Super Admin branch of `workspace`):

```html
<article class="panel tournament-configuration">
  <div class="workspace-section-head">
    <div>
      <p class="eyebrow">1. Tournament configuration</p>
      <h2>Set up Tournament</h2>
    </div>
    <span>Super Admin</span>
  </div>
  <form class="form-grid" data-start-event-form novalidate>
    <p class="muted-note full-width">Editing below changes ${escapeHtml(cleanName(tournament.name, "the current Event"))}. To keep its Matches and switch to a fresh Event instead, start one here.</p>
    ${state.startEventForm.failure ? `<p class="form-failure full-width" role="alert">${escapeHtml(state.startEventForm.failure)}</p>` : ""}
    <label class="field">
      <span class="label">New Event name</span>
      <input class="input" name="eventName" data-start-event-field="name" value="${escapeAttr(state.startEventForm.name)}" maxlength="48" placeholder="Fall Classic">
    </label>
    <label class="field">
      <span class="label">Courts to use</span>
      <input class="input" type="number" min="1" max="16" name="courts" data-start-event-field="courts" value="${escapeAttr(state.startEventForm.courts)}">
    </label>
    <div class="row-actions full-width">
      <button class="button ghost" type="button" data-action="start-new-event"${state.startEventForm.pending ? " disabled" : ""}>${state.startEventForm.pending ? "Starting…" : "Start New Event"}</button>
    </div>
  </form>
  <form id="tournament-form" class="form-grid" data-tournament-form novalidate>
    … Tournament name, Courts to use, Match target, Target score, Transition, Win by 2, Registered players, Generate Schedule / Reset Tournament …
  </form>
  ${renderTournamentPlayerCreator()}
  </article>
```

State (`app.js`):

```js
const defaultStartEventForm = {
  name: "",
  courts: 2,
  failure: "",
  pending: false,
};
// input handler branch:
state.startEventForm = { ...state.startEventForm, [field]: startEventInput.value, failure: "" };
// startNewEvent() on success:  state.startEventForm = { ...defaultStartEventForm };
```

**Important rendering fact:** the app re-renders the whole view from state
(`update()` → innerHTML) on refreshes, toasts and polling. A `<details>` element's
open/closed state is DOM-only, so it would snap shut on the next re-render unless
it is stored in state. Step 2 handles this.

Existing `<details>` styling to reuse (section 11):

```css
.format-estimate > summary,
.round-group > summary {
  cursor: pointer;
  color: var(--navy);
  font-weight: var(--font-weight-extrabold);
}
```

Vocabulary (from `CONTEXT.md` / the product-vocabulary ticket): "Event" is the
container (Fall Classic); "Open Play" is the format; "Match", "Schedule" as usual.
Button labels use Title Case ("Start New Event").

## Commands you will need

| Purpose | Command | Expected |
|---|---|---|
| Focused tests | `node --test tests/progressive-tournament-workspace.test.js tests/tournament-form-errors.test.js tests/product-vocabulary.test.js tests/stylesheet-contract.test.js tests/tournament-records-tokens.test.js` | same as your baseline run of these files |
| All browser tests | `node --test` | failures == baseline (5 stylesheet-token tests; see plans/README.md) |
| API tests (unchanged API, optional) | `php tests/start_event_test.php` (needs the test DB, see `tests/test_db.php`) | PASS, or skip if no DB |
| Serve | `php -S 127.0.0.1:8000 -t .` | listening |

## Scope

**In scope**: `app.js` (`renderTournament()` markup, `defaultStartEventForm`, one
new `toggle` listener), `styles.css` (one new small rule block in section 11),
`tests/start-event-disclosure.test.js` (create).

**Out of scope**:
- `startNewEvent()` logic, `api/start-event.php`, and the `data-start-event-field`
  input branch (except that it already spreads state, which keeps `open`).
- The configuration form fields and their order.
- Reset Tournament styling (plan 002).
- The non-Super-Admin `tournament-operations` branch.

## Git workflow

Branch `advisor/004-start-event-disclosure`, one commit, e.g. `Separate starting a
new Event from Tournament setup`. No push/PR unless instructed.

## Steps

### Step 1: Add `open` to the start-event state

```js
const defaultStartEventForm = {
  name: "",
  courts: 2,
  failure: "",
  pending: false,
  open: false,
};
```

Because `startNewEvent()` resets to `{ ...defaultStartEventForm }` on success, the
disclosure closes automatically after a new Event starts.

**Verify**: `grep -c "open: false," app.js` ≥ 1 and `node --test` has no new failures.

### Step 2: Keep the disclosure's open state across re-renders

Next to the other `app.addEventListener(...)` registrations (after the
`app.addEventListener("change", …)` block), add:

```js
  // <details> open state is DOM-only; keep it in state so re-renders do not collapse it.
  app.addEventListener("toggle", function (event) {
    if (event.target.matches && event.target.matches("[data-start-event-details]")) {
      state.startEventForm = { ...state.startEventForm, open: event.target.open };
    }
  }, true);
```

(`toggle` does not bubble; the `true` capture flag makes the listener on `app` see it.)
Do not call `update()` here — the DOM is already correct.

### Step 3: Move the mini-form into a disclosure at the end of the card

In `renderTournament()`:
1. Cut the whole `<form class="form-grid" data-start-event-form novalidate> … </form>`
   block from its current position (right after the `workspace-section-head` div).
2. Paste it, wrapped as below, **after** `${renderTournamentPlayerCreator()}` and
   before the closing `</article>` of the Super Admin branch:

```html
<details class="start-event-details" data-start-event-details${state.startEventForm.open || state.startEventForm.failure || state.startEventForm.pending ? " open" : ""}>
  <summary>Start a new Event</summary>
  <form class="form-grid" data-start-event-form novalidate>
    <p class="muted-note full-width">Keeps ${escapeHtml(cleanName(tournament.name, "the current Event"))} and its Matches in History, then switches this workspace to a fresh Event.</p>
    ${state.startEventForm.failure ? `<p class="form-failure full-width" role="alert">${escapeHtml(state.startEventForm.failure)}</p>` : ""}
    <label class="field">
      <span class="label">New Event name</span>
      <input class="input" name="eventName" data-start-event-field="name" value="${escapeAttr(state.startEventForm.name)}" maxlength="48" placeholder="Fall Classic">
    </label>
    <label class="field">
      <span class="label">Courts for the new Event</span>
      <input class="input" type="number" min="1" max="16" name="courts" data-start-event-field="courts" value="${escapeAttr(state.startEventForm.courts)}">
    </label>
    <div class="row-actions full-width">
      <button class="button ghost" type="button" data-action="start-new-event"${state.startEventForm.pending ? " disabled" : ""}>${state.startEventForm.pending ? "Starting…" : "Start New Event"}</button>
    </div>
  </form>
</details>
```

Only three things change inside the form: the wrapper, the intro sentence, and
the second label ("Courts to use" → "Courts for the new Event"). All `name`,
`data-*`, `maxlength`, `min`/`max` attributes stay byte-identical.

**Verify**:
- `grep -c 'data-start-event-details' app.js` → 2 (markup + listener)
- `grep -c '<span class="label">Courts to use</span>' app.js` → 1 (only the configuration form now)
- `grep -c '<span class="label">Courts for the new Event</span>' app.js` → 1

### Step 4: Style the disclosure like the other workspace disclosures

In `styles.css` section 11, extend the existing summary rule's selector list and
add a separator. Change

```css
.format-estimate > summary,
.round-group > summary {
```

to

```css
.format-estimate > summary,
.round-group > summary,
.start-event-details > summary {
```

and add after the `.tournament-configuration > form .muted-note { … }` rule:

```css
/* Starting a new Event is occasional; it sits below setup as its own step. */
.start-event-details {
  padding-top: var(--space-4);
  border-top: 1px solid var(--border-subtle);
}

.start-event-details > .form-grid {
  margin-top: var(--space-3);
}
```

Tokens only — no raw colors or px gaps (`tests/stylesheet-contract.test.js`,
`tests/tournament-records-tokens.test.js`).

**Verify**: `node --test tests/stylesheet-contract.test.js tests/tournament-records-tokens.test.js` → no new failures.

### Step 5: Regression test

Create `tests/start-event-disclosure.test.js` (read
`tests/progressive-tournament-workspace.test.js` first and follow how it loads
`app.js` source). Assert on the `app.js` source:
1. `data-start-event-form` appears **after** `${renderTournamentPlayerCreator()}` in
   the file (compare `indexOf`), and inside a `<details class="start-event-details" data-start-event-details`.
2. The details open condition references `state.startEventForm.open`,
   `state.startEventForm.failure` and `state.startEventForm.pending`.
3. `defaultStartEventForm` includes `open: false`.
4. A capture-phase `"toggle"` listener exists that writes `open` into `state.startEventForm`.
5. The label `Courts for the new Event` exists, and `Courts to use` appears exactly once.

**Verify**: `node --test tests/start-event-disclosure.test.js` → all pass.

### Step 6: Behavior check in the browser

Use `plans/tools/preview-harness.js` (header explains usage). Boot `view=tournament`:
1. The card now reads top-down: heading → Tournament name … Registered players →
   Generate Schedule / Reset Tournament → Create player account → a closed
   "Start a new Event" row.
2. Click "Start a new Event": fields appear. Type "Fall Classic". Now force a
   re-render by clicking the page header's refresh button: the disclosure must stay
   open and the typed name must remain.
3. Click "Start New Event": with the harness stub the request "succeeds" and a toast
   reads "Started …" — or, if the stubbed reply lacks a tournament, an inline
   `form-failure` appears **inside the still-open disclosure**. Either outcome is
   acceptable; a failure hidden inside a closed disclosure is not.
4. At 390px wide: no horizontal overflow (`document.documentElement.scrollWidth === innerWidth`).
Run `clearPreviewHarness()`.

### Step 7: Full suite

**Verify**: `node --test` → failures == baseline list.

## Test plan

New `tests/start-event-disclosure.test.js` (Step 5). Existing
`progressive-tournament-workspace`, `tournament-form-errors`, `product-vocabulary`,
`stylesheet-contract`, `tournament-records-tokens` must not regress. Browser
behavior check in Step 6 (re-render survival is the risky part).

## Done criteria

- [ ] Greps in Step 3 return the stated counts
- [ ] `node --test tests/start-event-disclosure.test.js` exits 0
- [ ] `node --test` failures == baseline list
- [ ] Step 6 items 1–4 observed
- [ ] Only `app.js`, `styles.css`, the new test and `plans/README.md` modified

## STOP conditions

- A grep in "Current state" differs (the Tournament workspace has been reworked).
- A test asserts the start-event form is the first form in the card — report it; do
  not rewrite that test's intent.
- The disclosure collapses on re-render even with Step 2 in place — report what
  triggers it rather than adding more state.
- You find yourself editing `startNewEvent()` or the API.

## Maintenance notes

- Any new `<details>` in a re-rendered view needs the same treatment (state-backed
  `open`); the existing `.format-estimate` and `.round-group` disclosures do not
  have it yet and will collapse on refresh — candidate follow-up.
- Reviewers: diff the moved form block with `git diff --color-moved` to confirm only
  the wrapper, intro sentence and one label changed.
