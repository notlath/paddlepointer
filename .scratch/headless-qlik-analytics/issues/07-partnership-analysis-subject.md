# 07: Partnership Analysis subject

**What to build:** Recreate Partnership Analysis in the native Analytics preview with a custom relationship visualization and distinct ranked and below-threshold Partnership details. The interface must preserve Qlik's qualification logic and make sparse content feel intentional rather than filling space with invented metrics.

**Blocked by:** 02: Native analytics session and selection shell.

**Status:** ready-for-agent

- [ ] Ranked Partnerships include only those with at least three Matches together, using the governed Qlik result rather than a JavaScript threshold calculation.
- [ ] Below-threshold Partnerships remain available in a separate native table driven by their existing analytical data source.
- [ ] The custom visualization and both tables respond to shared Player, Event and Partnership selections.
- [ ] No KPI band or filler content is added when the subject has no meaningful KPI.
- [ ] Both detail tables use bounded pages and provide accessible labels and narrow-screen overflow behavior.
- [ ] One runnable automated check covers ranked/unranked separation and a selection-driven refresh.
