# 05 — Replace dashed, dotted, and underlined state styling

**What to build:** Selected, disabled, busy, warn, and destructive controls still communicate their state without relying on color alone, but they look deliberate instead of broken. Today selected segments, Live Board tabs, and the current navigation item get a thick 3px underline (even on the lime nav pill); disabled and warn buttons get dashed borders; busy buttons get dotted borders; and danger buttons get an inset ring in their text color.

Origin: UI polish audit finding H5. Preserves the P2-08 requirement that states are distinguishable without color alone.

**Blocked by:** 02 — Give buttons a visible, clean hover

**Status:** completed

- [x] Selected segments and Live Board tabs use a solid filled or bordered selected treatment plus a non-color cue such as a check icon or heavier weight, with no text underline
- [x] The current navigation item keeps its lime pill and relies on it plus the page landmark, with no underline
- [x] Disabled controls use a muted fill, muted text, and a not-allowed cursor, without dashed borders, and still meet the disabled contrast baseline
- [x] Busy controls show a small inline progress indicator and busy label (for example "Signing in…") instead of a dotted border, and the indicator stops animating under reduced motion
- [x] Warn buttons look like a normal filled variant; the warning meaning comes from the label and confirmation flow, not a dashed border
- [x] Destructive buttons use a solid danger fill without an inset ring and remain spatially separated from safe actions in confirmations
- [x] Any icons added come from one consistent icon style and use the current text color
- [x] Screen reader state (aria-pressed, aria-selected, aria-current, aria-busy, disabled) is unchanged
- [x] A focused visual check covers setup segments, Live Board tabs, sidebar and drawer navigation, sign-in pending, Scoreboard End Match and Reset, and destructive confirmations
