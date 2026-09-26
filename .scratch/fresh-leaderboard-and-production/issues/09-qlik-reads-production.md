# 09 — Qlik reads production; duplicate connections removed

**What to build:** The Qlik app reloads from production instead of the developer's ngrok tunnel. The REST connections the load script actually uses are repointed at the production analytics endpoints with the production analytics key. The tenant currently holds every analytics connection twice, plus an old "PaddlePoint API" connection to production's tournament endpoint; the unused ones are deleted so no future reload reads the wrong source. Local development no longer feeds Qlik; no dev copy of the Qlik app is made until one is needed.

**Blocked by:** 08 — Deploy to production on cPanel

**Status:** ready-for-agent

- [ ] The connections referenced by the app's load script are identified, and the list to repoint and to delete is shown to the user and approved before any deletion
- [ ] Referenced connections point at the production analytics endpoints and authenticate with the production key
- [ ] Duplicate and unused connections are deleted
- [ ] A reload succeeds and its data matches production (the freshness check passes against production)
- [ ] The app Leaderboard on "All Events" and Analytics with nothing selected agree on a spot-checked Player's standings
