# 08 — Standardize interaction and reduced-motion states

**What to build:** Buttons, navigation items, tabs, switches, inputs, clickable records, and dialogs respond consistently to hover, press, keyboard focus, selection, loading, and disabled states. Users who request reduced motion receive an immediate, stable interface.

Origin: UI/UX audit finding DS-06.

**Blocked by:** 01 — Expand the stylesheet with semantic UI tokens

**Status:** ready-for-agent

- [ ] Hover and focus-visible have distinct treatments and keyboard focus is never removed
- [ ] Pressed feedback appears promptly without shifting surrounding layout
- [ ] Selected, disabled, loading, warning, and destructive states are distinguishable without relying on color alone
- [ ] Motion durations and easing use the shared motion scale and remain within a restrained interaction range
- [ ] Transitions animate transform or opacity rather than width, height, or positional layout properties where practical
- [ ] Reduced-motion preference disables or shortens drawer, dialog, switch, tab, and state-change motion without hiding feedback
- [ ] The same state means the same thing across authentication, navigation, Match, Live, Tournament, History, and account flows
