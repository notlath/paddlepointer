# 25 — History, Games and users go through the Shared store

**What to build:** Loading History, saving a Game, loading the user list and fetching the LAN link all go through the Shared store module from 23. Each follows the same failure policy, and the checks scattered across calls ("re-render if this view is showing") go away. The failure messages people see stay as they are today.

Origin: architecture review candidate C5.

**Blocked by:** 23 — A Shared store module for the Tournament

**Status:** done

- [x] History, saving a Game, the user list and the LAN link behave as before when the server is reachable
- [x] When the server is unreachable, each shows the same message as it does today
- [x] No individual server call decides which views to re-render
- [x] Tests with the in-memory stand-in cover a failure for each of these
