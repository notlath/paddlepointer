# 04 — Remove superseded stylesheet branches

**What to build:** The stylesheet finishes its migration with one token foundation and one authoritative rule path per shared pattern. Superseded root definitions, responsive branches, and court overrides are removed only after every current consumer uses the consolidated paths.

Origin: UI/UX audit finding DS-03. This is the contract step of the stylesheet migration.

**Blocked by:** 02 — Migrate the application shell to one responsive style path; 03 — Migrate court, Scoreboard, and Live visuals to one court pattern

**Status:** completed

- [x] There is one authoritative root token definition
- [x] No later mobile-navigation block reverses the consolidated drawer behavior
- [x] No later court block reverses the canonical court-color or line model
- [x] Shared typography, spacing, radius, elevation, state, and layer values resolve through the semantic token vocabulary
- [x] Removing the superseded declarations does not change the intended cascade for unrelated screens
- [x] Responsive visual checks pass at 320, 375, 768, 1024, 1280, and 1440 pixel widths
- [x] The existing automated test suite remains green
