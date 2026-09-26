# 09: Cross-subject resilience and accessibility

**What to build:** Make the complete native Analytics preview behave as one resilient product surface. Staff can move among all six subjects with selections intact, use it by keyboard and at narrow widths, understand chart data without sight, and recover cleanly when Qlik authentication, sessions or data requests fail.

**Blocked by:** 03: Overview Analytics subject; 04: Match Analysis subject; 05: Leaderboard Analytics subject; 06: Player Performance subject; 07: Partnership Analysis subject; 08: Event and Court Analytics subject.

**Status:** ready-for-agent

- [ ] Selections made in any subject remain visible and affect every subsequently opened subject until cleared or reversed.
- [ ] Switching subjects mounts only the active subject and does not leak object handles, duplicate listeners or QIX sessions.
- [ ] Every custom chart has a useful accessible name, keyboard behavior where interactive, and a text or tabular equivalent for its analytical result.
- [ ] Every table is labelled, paged and usable with keyboard and screen-reader navigation.
- [ ] All subjects work at desktop, tablet and phone widths without clipped controls or nested page scrolling.
- [ ] Authentication failure, token expiry, dropped connection, empty data and individual object failure produce actionable states without destroying the native shell.
- [ ] Automated checks cover cross-subject selection persistence, cleanup and failure recovery; a visible-browser verification covers all six subjects.
