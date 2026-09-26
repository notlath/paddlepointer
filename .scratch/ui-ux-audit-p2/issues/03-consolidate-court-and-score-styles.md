# 03 — Migrate court, Scoreboard, and Live visuals to one court pattern

**What to build:** Scoreboard, setup preview, Match summary, and Live Board use one recognizable court treatment with consistent playing areas, kitchen, lines, net, serving emphasis, and score typography. Late overrides no longer silently reverse court colors or line placement.

Origin: UI/UX audit findings DS-03 and PO-03.

**Blocked by:** 01 — Expand the stylesheet with semantic UI tokens; P0-10 — Make the mobile scoreboard safe for live scoring; P1-11 — Give every Live court slot a visible state

**Status:** completed

- [x] A single court-color and line model is shared by setup preview, active Scoreboard, Match summary, and Live Board
- [x] Serving state remains distinguishable through text or shape as well as color
- [x] Court and score labels meet the established text-size and contrast baseline
- [x] Mobile Scoreboard and TV-mode Live Board retain their task-specific density and viewing-distance requirements
- [x] Completed, upcoming, active, empty, loading, and failed Live states remain visually distinct
- [x] Removing superseded court declarations causes no layout or behavioral regression
- [x] Visual checks cover singles, doubles, Team A serving, Team B serving, upcoming, ongoing, and final Match states
