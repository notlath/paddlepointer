# 01 — Confirm every Sheet actually renders

**What to build:** Nothing. A recorded check, in a visible browser, that all six Sheets and
the Admin dashboard chart paint correctly today — before any composition work lands on top
of broken objects.

`.scratch/qlik-event-dashboard/fix-missing-visualization.mjs` warns that the charts it
repaired still lack the axis, legend and colour defaults the Qlik editor writes, so
`sn-bar-chart`, `sn-line-chart` and `sn-scatter-plot` can still throw. Qlik MCP returned
`QEP-104` on every attempt during the design session, so this could not be settled then.

Serve via `herd secure paddlepoint` (the tenant's CORS allowlist only has
`https://paddlepoint.test`). Use a **visible** browser: a hidden pane pauses
`requestAnimationFrame` and makes every chart look blank whether it is broken or not.

**Blocked by:** None

**Status:** done (2026-09-20). Three defects found; finding 2 fixed by the user the same day, finding 3 diagnosed and handed to ticket 09.

- [x] Each of the six Sheets recorded here as renders / partially renders / blank, per object
- [x] The Admin dashboard trend chart recorded the same way
- [x] Browser console errors captured for anything that does not paint
- [x] For any blank object: whether it is the missing-`visualization` class of failure or the
      missing-editor-defaults class

## How this was checked

Three passes, because each one alone lies in a different direction.

1. `../inspect-sheets.mjs` — every object on every Sheet over the engine API, on the
   tenant-admin key. Says what a browser cannot: which objects lack `visualization`.
2. `../render-as-embed-user.mjs` — the same walk as the **embed user**, using the OAuth M2M
   impersonation token the browser actually gets. Ticket 11 proved a tenant-admin key sees
   objects that no other identity can, so the admin pass on its own is not evidence.
3. `../browser-render-check.mjs` + `qlik-render-check.html` (site root) — does it *paint*.
   Drives Edge headless over CDP, because the agent's browser pane runs hidden and a hidden
   pane pauses `requestAnimationFrame`, which makes every chart look blank. **Leaderboard is
   the control**: it renders here, so the harness is a valid oracle and a blank elsewhere is
   a real failure. The page carries no credentials — the token is injected over CDP.

## Finding 1 — engine-side is clean; the 2026-09-18 repair held

37 objects across the six embedded Sheets: **0 missing `visualization`, 0 engine errors.**
43 of 43 app-wide. Nothing here needs repairing again.

## Finding 2 — two Sheets are unpublished, so the embed user cannot see them at all

`GetObject` returns `qHandle: null` for Overview and Match Analysis as the embed user, while
the other four resolve normally. Asked what it can see, the embed user lists exactly four
Sheets — the four with `published=true`.

This is the tail of the visualization repair: its own note warns *"after `--apply` every
sheet came back unpublished and had to be re-published"*. Four were re-published. Two were
missed.

| Sheet | published | embed user sees it |
|---|---|---|
| Overview | **false** | **no** |
| Match Analysis | **false** | **no** |
| Leaderboard | true | yes |
| Player Performance | true | yes |
| Partnership Analysis | true | yes |
| Event / Court Analytics | true | yes |

Two consequences in the live app:

- **Overview is the landing tab** of the Analytics view (`QLIK_SHEETS[0]`), so the first
  thing staff see is "Loading…" forever.
- **The Admin dashboard chart is broken for every staff member.** `cahVPXg` lives on Match
  Analysis, so the *Matches Over Time* card on `home` fails with
  `Fatal error for embedded ui analytics/chart: Failed to render vizualisation cahVPXg:
  Object not found` — the same error ticket 11 diagnosed, from the same cause.

**Fixed by the user, 2026-09-20** (publishing is a visibility change to shared content, so it
was theirs to make, per ticket 11). Re-verified: all six Sheets and `cahVPXg` now resolve for
the embed user, `0 failure(s)`. The Admin dashboard chart paints again — in PaddlePoint green,
so the `theme="PaddlePoint"` on that one element has been working all along.

Publishing also fixed **Match Analysis entirely** and Overview's KPI row, which the first pass
could not see behind "Loading…". That narrowed finding 3 from five Sheets to four.

## Finding 3 — objects built on 2026-09-18 carry no chart defaults and never draw

**Superseded the first write-up of this finding.** Before the two Sheets were published, this
looked like a whole-Sheet failure on three Sheets. With all six visible it is plainly
per-object, and the cause is now proven rather than correlated — see "Cause" below.

### Original observation (three published Sheets render their chrome but no content)

Worse than the publish bug, and new. Screenshot: `render-check.png` (session scratchpad).

| Sheet | what paints |
|---|---|
| Leaderboard | **everything** — standings table with data, both filter panes populated |
| Player Performance | filter panes, object titles, KPI numbers — **plus a red "Error" badge**; every chart and table body empty |
| Partnership Analysis | filter panes and object titles only; bodies empty |
| Event / Court Analytics | filter panes and object titles only; bodies empty |
| Overview | "Loading…" (finding 2) |
| Match Analysis | "Loading…" (finding 2) |

So the Sheets mount, lay out, and know their objects' titles; the objects draw nothing.
Only one console error surfaced in the whole page — the `cahVPXg` one above — so these
objects fail silently.

### What it is not

**Not frame height.** The obvious suspect was that Leaderboard is the only Sheet at 24×12
while the others run 20–28 rows, so their objects sit outside an 850px frame. Tested by
re-running with the frame forced to 2400px: **the bodies are still empty.** Hypothesis dead.
Recording it so nobody re-runs the experiment.

**Not `visualization`** (finding 1) and **not visibility** (these four resolve fine as the
embed user).

### Dead hypothesis: object type

Before publishing, the only Sheet that rendered was the only one built from `sn-table`, which
suggested legacy `table` / `barchart` / `linechart` were the problem. **Publishing killed
that**: Match Analysis's `barchart` and `linechart` paint perfectly, while Player
Performance's objects of exactly those types do not. Type is not the discriminator.

### Cause, proven

The discriminator is **how complete the object's property set is**. Compare two `barchart`
objects on the *same* Sheet — `cahVPXg`, which paints, against `GSVRc`, which is an empty
titled box (`diff-object-props.mjs`):

| chart | property paths |
|---|---|
| `cahVPXg` barchart — paints | **88** |
| `GSVRc` barchart — blank | **18** |
| `nPQgD` (Overview) barchart — blank | **18** |
| `TBmZGDz` (Player Performance) barchart — blank | **18** |
| `BFVmfVy` linechart — paints | **96** |
| `KqqEKw` (Player Performance) linechart — blank | **18** |

The blank objects are missing `color.auto`, `gridLine.auto`, `legend.show`, `dimensionAxis.*`,
`measureAxis.*`, `dataPoint.*`, `orientation`, `scrollbar`, `tooltip.auto` and the rest of the
renderer's expected defaults. And the browser throws exactly what that predicts:

```
TypeError: Cannot read properties of undefined (reading 'auto')
```

— the renderer reading `.auto` off a `color` / `gridLine` object that was never written.

The broken objects have **nothing** the working ones lack: their property set is a strict
subset. So the repair is purely additive, never destructive.

This is the second half of `fix-missing-visualization.mjs`'s own warning, the half that was
never done: *"these charts also lack the axis/legend/color defaults the Qlik editor creates."*
It splits by build session, not by type — the objects created on 2026-09-17 (Leaderboard,
Match Analysis's originals) have full property sets; those created on 2026-09-18 have 18. The
tell is inside Match Analysis itself, which otherwise renders: its two later additions,
`Avg Duration by Round` and `Avg Duration by Court`, are the only empty boxes on the Sheet.

## Current state after the publish

| Sheet | renders |
|---|---|
| Leaderboard | fully |
| Match Analysis | fully, except its two later additions (`Avg Duration by Round` / `by Court`) |
| Overview | KPI row only; Top 10, Matches Over Time, Win Rate Distribution, Recent Matches empty |
| Player Performance | KPI row only; all five content objects empty |
| Partnership Analysis | filter panes and titles only |
| Event / Court Analytics | filter panes and titles only |
| Admin dashboard chart | fully, in PaddlePoint green |

## What this means for the track

**Tickets 03–08 stay blocked behind ticket 09**, which now has a proven cause and a shape for
the fix. Composing Sheets whose objects do not draw is wasted work, and ticket 02's theme swap
cannot be judged against empty bodies.

## Re-running

```
node .scratch/qlik-sheet-design/inspect-sheets.mjs          # engine, tenant admin
node .scratch/qlik-sheet-design/render-as-embed-user.mjs    # engine, embed user
node .scratch/qlik-sheet-design/browser-render-check.mjs <token-file> <out-dir>
node .scratch/qlik-sheet-design/diff-object-props.mjs <goodId> <badId>
```

The first needs `.scratch/qlik-event-dashboard/qlik_token.txt`; the other two read the M2M
credentials from `.env`. `browser-render-check.mjs` wants a freshly minted impersonation
token in a file — the same call `render-as-embed-user.mjs` makes.
