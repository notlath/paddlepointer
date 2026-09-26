# 09 — Give the starved objects their chart defaults (FOLDED INTO 03-08)

**What to build:** The chart and table objects created on 2026-09-18 carry 18 property paths
where a working object of the same type carries 88–96. They are missing the renderer's
expected defaults, so they mount, show their title, and draw nothing. Give them the defaults.

Numbered 09 because it was not foreseen when the track was written, but it runs **before**
03–08: composing a Sheet whose objects do not draw is wasted work, and ticket 02's theme swap
cannot be judged against empty bodies.

**The cause is proven, not guessed** — see ticket 01, finding 3. Two `barchart` objects on the
same Sheet, `cahVPXg` (88 paths, paints) against `GSVRc` (18 paths, blank); the blank one is
missing `color.auto`, `gridLine.auto`, `legend.*`, `dimensionAxis.*`, `measureAxis.*`,
`dataPoint.*`, `orientation`, `scrollbar`, `tooltip.auto`. The browser throws exactly what
that predicts: `TypeError: Cannot read properties of undefined (reading 'auto')`. The starved
set is a strict subset of the healthy one, so the repair is **additive only**.

Do not re-open these, all closed by ticket 01: it is not the missing `visualization` property
(all 37 objects have it), not Sheet visibility (fixed by publishing), not frame height (tested
at 2400px), and **not object type** (Match Analysis's `barchart` and `linechart` paint while
Player Performance's objects of the same types do not).

**Affected:** every content object on Overview, Player Performance, Partnership Analysis and
Event / Court Analytics, plus Match Analysis's two later additions (`Avg Duration by Round`,
`Avg Duration by Court`). Leaderboard and the rest of Match Analysis are already healthy and
serve as the reference for what a complete property set looks like.

## Decision: folded into the 03-08 hand rebuilds

Taken 2026-09-20. Every affected Sheet is already being recomposed by hand in tickets 03-08,
and recreating an object in the Qlik editor writes the full default set — so the repair costs
nothing extra there, and doing it separately would mean touching all 17 objects twice.

The alternative, a programmatic pass copying defaults from a healthy object, is faster across
17 objects but is the same route that caused both bugs this track has now spent a session
finding: `fix-missing-visualization.mjs` wrote properties that way and left every Sheet
unpublished, which is what ticket 01's finding 2 turned out to be.

Each of 03-08 now names its own starved objects and gates on
`check-object-health.mjs` reporting zero. The rest of this ticket is the evidence behind that
gate.

## The two options as they stood

**By hand in the Qlik editor.** Recreating an object in the editor writes the full default
set. This is what `docs/qlik-sheet-design.md` already mandates for visual work, and tickets
03–08 rebuild every one of these Sheets by hand anyway — so the repair may be free if it is
folded into those rebuilds rather than done twice.

**Programmatically**, copying the missing paths from a healthy object of the same type onto
each starved one. Faster across ~20 objects, but this is the same route that produced the
problem: `fix-missing-visualization.mjs` patched properties this way, and its own note records
that every Sheet came back unpublished afterwards and had to be re-published — which is what
finding 2 turned out to be.

Decide which before touching anything. If it is the programmatic route, check the publish
state after writing, every time.

**Blocked by:** nothing — this ticket is not work. Its fix lives in 03-08.

**Status:** diagnosed 2026-09-20; **closed as folded into 03-08 the same day.** Kept as the
write-up of the cause, not as work. Do not implement it separately.

- [x] The cause is identified, not guessed, and recorded here
- [x] The object-type hypothesis is killed, with evidence
- [x] Decided: folded into the 03–08 hand rebuilds
- [x] A gate exists so a half-finished rebuild cannot pass — `check-object-health.mjs`,
      which today reports 17 starved and 1 unverifiable of 22 gated objects

Carried into 03-08, to be true when the last of them lands:

- [ ] Every affected object carries a full property set for its type
- [ ] All six Sheets draw their content, confirmed by `browser-render-check.mjs` with
      Leaderboard still passing as the control
- [ ] No Sheet came back unpublished (re-run `render-as-embed-user.mjs`: expect 0 failures)
- [ ] The `TypeError: Cannot read properties of undefined (reading 'auto')` is gone from the
      browser console
