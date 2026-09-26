# 09 — Introduce one accessible destructive confirmation pattern

**What to build:** Ending or resetting an active Match and resetting or clearing an Open Play event use one PaddlePoint confirmation dialog that states the exact consequence, makes the safe action primary, and returns focus after the decision. This is the expand step for replacing browser-native confirms.

Origin: UI/UX audit finding U-12.

**Blocked by:** P0-07 — Give dialogs a complete keyboard focus lifecycle; P0-10 — Make the mobile scoreboard safe for live scoring; P1-08 — Turn Tournament into a progressive operations workspace

**Status:** ready-for-agent

- [ ] End Match, Reset Match, replace-active-Match, Reset Open Play, and Clear Results use the shared confirmation behavior
- [ ] Every dialog names the affected Match or event and states what will be saved, reset, unlocked, or removed
- [ ] The safer cancel or continue option receives initial focus
- [ ] The destructive action is visually and spatially separated from the safe action
- [ ] Confirming runs the existing operation once and exposes its existing success or failure result
- [ ] Canceling changes no Match, Tournament, History, or local state
- [ ] Keyboard focus returns to the invoking control or a sensible surviving fallback
- [ ] Browser-native confirmation remains temporarily available only for actions not yet migrated by ticket 10
