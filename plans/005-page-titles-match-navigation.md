# Plan 005: Page titles match the navigation, refresh buttons share one label, and each page has one primary action

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git status --short app.js` must be empty (the
> in-progress Live Board revamp is committed — see plans/README.md "Prerequisite").
> Then run every grep in "Current state"; any count mismatch is a STOP condition.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW (copy and one class change; no logic)
- **Depends on**: none (only the README prerequisite)
- **Category**: tech-debt (UX consistency / wayfinding)
- **Planned at**: commit `accaf45` + uncommitted `dev` working tree, 2026-09-23

## Why this matters

When a staff member clicks a sidebar item, the page heading should confirm where
they landed. Today it often doesn't:

| Sidebar item | Page `<h1>` today |
|---|---|
| History | "Shared Matches" / "Saved Matches" / "Visitor Matches" (varies by role and data source) |
| Leaderboard | "Standings" / "Visitor Standings" |
| Tournament | event name, e.g. "Open Play", under the eyebrow "Doubles Mixer" (a term used nowhere else) |

Other screens already link to these pages as "Match History" (Dashboard and
Leaderboard buttons), so one page has four names. The refresh buttons have six
labels for the same action: "Refresh", "Refresh Shared", "Refresh Live",
"Refresh Leaderboard", "Refresh people", "Refresh Visitor History", with busy
states that mix "..." and "…". The Admin Dashboard also shows **two** lime primary
buttons ("Set Up Tournament" in the header and "Open Full Analytics" in the chart
card), so neither reads as the main action; `DESIGN.md` §8 says analytics is for
"deeper exploration", which makes it the secondary one.

Rule this plan applies: **a fixed destination's `<h1>` equals its sidebar label;
when the `<h1>` is dynamic (an event name, a rules sheet title, a user's name) the
eyebrow above it carries the sidebar label.** Data source and role perspective go in
the description line under the title, which already carries them.

## Current state

File: `app.js` only. Greps (each must print the count shown):

```text
grep -c '<h1>${isVisitor() ? "Visitor Matches" : isStaff() ? (shared ? "Shared Matches" : "Saved Matches") : "My Matches"}</h1>' app.js   → 1   (renderHistory)
grep -c 'const shared = state.historySource === "shared";' app.js                                                                         → 1   (renderHistory, only used by that h1)
grep -c '<h1>${isVisitorBoard ? "Visitor Standings" : isStaff() ? "Standings" : "My match stats"}</h1>' app.js                             → 1   (renderLeaderboard)
grep -c '<p class="eyebrow">Doubles Mixer</p>' app.js                                                                                    → 1   (renderTournament page-title)
grep -c '<button class="button primary" data-action="view" data-value="analytics">Open Full Analytics</button>' app.js                   → 1   (Admin Dashboard chart card)
grep -cE '"Refreshing Shared\.\.\." : "Refresh Shared"' app.js       → 2   (History header, Tournament header)
grep -cE '"Refreshing Live\.\.\." : "Refresh Live"' app.js           → 1   (Live Board header)
grep -cE '"Refreshing Leaderboard\.\.\." : "Refresh Leaderboard"' app.js   → 1
grep -cE '"Refreshing Visitor History\.\.\." : "Refresh Visitor History"' app.js → 1   (Visitor home)
grep -cE '"Refreshing…" : "Refresh people"' app.js                   → 1   (People header)
grep -cE '"Refreshing\.\.\." : "Refresh"' app.js                     → 1   (Admin Dashboard header)
```

Every refresh button has this shape (keep everything except the two label strings):

```js
<button class="button ghost" data-action="refresh-history"${state.refreshingHistory ? ' disabled aria-busy="true"' : ""}>${state.refreshingHistory ? "Refreshing Shared..." : "Refresh Shared"}</button>
```

**Do not introduce a shared helper for these buttons.** `tests/data-refresh.test.js`
(lines ~179–182) matches the literal `data-action="refresh-…"` followed by
`disabled` and `aria-busy="true"` in the `app.js` source; a helper taking the
action as an argument would break those assertions.

Tests that mention these strings and must keep passing:
`tests/data-refresh.test.js`, `tests/product-vocabulary.test.js`,
`tests/view-access.test.js` (mentions "Open Full Analytics" in a comment only),
`tests/live-board-layout.test.js` (mentions "Refresh Live" only in an assertion message),
`tests/focused-admin-dashboard.test.js`, `tests/navigation-focus.test.js` (uses
"Doubles Mixer" only as mock text — unaffected).

## Commands you will need

| Purpose | Command | Expected |
|---|---|---|
| Focused tests | `node --test tests/data-refresh.test.js tests/product-vocabulary.test.js tests/view-access.test.js tests/focused-admin-dashboard.test.js tests/readable-refresh-feedback.test.js tests/records-hierarchy.test.js tests/operational-hierarchy.test.js` | same as your baseline run of these files |
| All browser tests | `node --test` | failures == baseline (5 stylesheet-token tests; see plans/README.md) |

## Scope

**In scope**: `app.js` (the strings listed above), `tests/page-titles.test.js` (create).

**Out of scope**:
- Sidebar labels in `view-access.js` (`navigationFor`) — they are the reference, and
  `tests/mobile-navigation.test.js` pins them.
- Browser tab titles / `document.title` logic and `navigation-focus.js`.
- Rules, Profile, Dashboard, Live Board, New Match, People headings — they already
  follow the rule (Dashboard/Rules/Profile use an eyebrow; Live Board, New Match,
  People match their nav label).
- API error strings (server side).

## Git workflow

Branch `advisor/005-page-titles`, one commit, e.g. `Match page titles to the
navigation`. No push/PR unless instructed.

## Steps

### Step 1: History title

Replace the History `<h1>` with:

```js
<h1>${isVisitor() || isStaff() ? "Match History" : "My Matches"}</h1>
```

Then `const shared = state.historySource === "shared";` in `renderHistory()` is
unused: delete that line **only if** `grep -n "shared" ` within `renderHistory()`
shows no other use. The data source remains visible in the description line
(`historyStatusText()` → e.g. "Showing 12 shared matches.").

**Verify**: `grep -c '"Shared Matches"' app.js` → 0; `grep -c '"Saved Matches"' app.js` → 0.

### Step 2: Leaderboard title

Replace the Leaderboard `<h1>` with:

```js
<h1>${isVisitorBoard || isStaff() ? "Leaderboard" : "My match stats"}</h1>
```

**Verify**: `grep -c '"Visitor Standings"' app.js` → 0.

### Step 3: Tournament eyebrow

Replace `<p class="eyebrow">Doubles Mixer</p>` with `<p class="eyebrow">Tournament</p>`.
Leave the `cleanName(tournament.name, "Doubles Mixer")` fallback in the `<h1>` alone.

### Step 4: One refresh label

For each of the seven refresh buttons listed in "Current state", set the idle label
to `"Refresh"` and the busy label to `"Refreshing…"` (single ellipsis character
U+2026, as the People button already uses). Change nothing else on those lines.

**Verify**:
- `grep -cE '"Refresh (Shared|Live|Leaderboard|people|Visitor History)"' app.js` → 0
- `grep -cE '"Refreshing[^"]*\.\.\."' app.js` → 0
- `grep -cE '\? "Refreshing…" : "Refresh"' app.js` → 7
- `node --test tests/data-refresh.test.js tests/readable-refresh-feedback.test.js` → pass

### Step 5: One primary action on the Admin Dashboard

Change `class="button primary" data-action="view" data-value="analytics">Open Full Analytics`
to `class="button ghost" data-action="view" data-value="analytics">Open Full Analytics`.

**Verify**: `node --test tests/focused-admin-dashboard.test.js tests/view-access.test.js tests/operational-hierarchy.test.js` → no new failures.

### Step 6: Regression test

Create `tests/page-titles.test.js` (read `tests/product-vocabulary.test.js` first and
reuse its way of loading `app.js`). Assert:
1. `app.js` contains `"Match History"` inside the `renderHistory` function body and
   none of `"Shared Matches"`, `"Saved Matches"`, `"Visitor Matches"`.
2. `renderLeaderboard` body contains `"Leaderboard"` in its `<h1>` and no `"Standings"` h1.
3. `app.js` has no `class="eyebrow">Doubles Mixer<`.
4. Every `data-action="refresh-(users|tournament|history|leaderboard)"` button line
   ends its label ternary with `"Refreshing…" : "Refresh"`.
5. The analytics view button is `button ghost`, not `button primary`.

**Verify**: `node --test tests/page-titles.test.js` → all pass; `node --test` →
failures == baseline.

## Test plan

New `tests/page-titles.test.js` (Step 6); the focused tests in "Commands" must not
regress. Optional visual check with `plans/tools/preview-harness.js`: boot
`view=history`, `view=leaderboard`, `view=tournament`, `view=home` and confirm the
headings/eyebrow and that the Dashboard shows a single lime button.

## Done criteria

- [ ] All Step 1–5 greps return the stated counts
- [ ] `node --test tests/page-titles.test.js` exits 0
- [ ] `node --test` failures == baseline list
- [ ] Only `app.js`, the new test and `plans/README.md` modified

## STOP conditions

- A grep in "Current state" differs.
- `tests/product-vocabulary.test.js` or another existing test asserts one of the old
  titles/labels as required copy — report which assertion; do not delete it.
- Removing `const shared` breaks anything (it is used elsewhere in the function).

## Maintenance notes

- New pages: `<h1>` = sidebar label, or eyebrow = sidebar label when the `<h1>` is
  dynamic. New refresh buttons: `"Refreshing…" : "Refresh"`.
- If product prefers "Standings" over "Leaderboard", change the sidebar label in
  `view-access.js` and `tests/mobile-navigation.test.js` together with this h1 —
  the point is one name, not which name.
