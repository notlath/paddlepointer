# 23 — A Shared store module for the Tournament

**What to build:** Loading and saving the Tournament go through one Shared store module that owns the request, error handling, the local cache and a single failure policy. When a Live poll fails, the board keeps showing the last shared Tournament instead of switching to this browser's stale local copy. And a new poll never starts while the previous one is still waiting.

Origin: architecture review candidate C5.

**Blocked by:** 01 — Open Play scheduler lives in its own tested module (sets the browser module and test pattern)

**Status:** done

- [x] Loading the Tournament, saving it and updating its Matches work as before when the server is reachable
- [x] When a Live poll fails, the Live board keeps the last Tournament the server sent
- [x] A new Live poll never starts while the previous one is still waiting
- [x] Tests with an in-memory stand-in for the server cover success, failure and a slow response
