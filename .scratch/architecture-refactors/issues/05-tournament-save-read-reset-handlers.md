# 05 — Saving, reading and resetting a Tournament go through handlers

**What to build:** Saving a Tournament schedule, reading the shared Tournament and clearing a Tournament's Games all behave exactly as they do today. They go through handlers, following 03's pattern, with tests for who may change what.

Origin: architecture review candidate C8, groundwork for C2 and C3.

**Blocked by:** 03 — Saving a Game goes through a handler tests can call

**Status:** ready-for-agent

- [ ] Saving, reading and clearing behave the same over HTTP
- [ ] Test: an Admin who isn't a Super Admin can only change Match result fields on an existing Tournament, and can't create one (403)
- [ ] Test: a Super Admin's schedule update that drops or changes an in-progress Match's lock is refused (409), unless the save is a reset
- [ ] Test: timing settings are clamped to their allowed ranges when saved
- [ ] Test: reading a Tournament that doesn't exist returns an empty result, not an error
- [ ] Test: clearing a Tournament's Games deletes only Games linked to that Tournament, and only a Super Admin may do it
