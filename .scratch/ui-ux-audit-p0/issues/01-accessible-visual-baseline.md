# 01 — Establish an accessible visual baseline

**What to build:** Text, button labels, and touch controls remain readable and operable throughout the authenticated application without losing PaddlePoint's navy, lime, orange, and court-green identity. This ticket establishes the baseline that the responsive sign-in and scoreboard work can safely build on.

Origin: UI/UX audit findings DS-01 and DS-02.

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

- [ ] Default authenticated body copy is at least 16px at a regular readable weight
- [ ] Secondary text and labels are at least 14px unless they are brief, nonessential annotations
- [ ] Text on orange and court-green actions reaches WCAG AA contrast for normal text in default, hover, active, focus, and disabled states
- [ ] Frequently used touch controls have a target of at least 44 by 44 CSS pixels
- [ ] The existing navy-and-lime primary action treatment remains visually recognizable
- [ ] At 200% browser zoom, text and controls remain readable without content overlap or loss of action labels
