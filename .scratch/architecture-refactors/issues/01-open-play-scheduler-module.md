# 01 — Open Play scheduler lives in its own tested module

**What to build:** Generating an Open Play schedule works exactly as it does today, but the scheduler becomes its own module, separate from the main app script. The page and Node's built-in test runner load the same file, and randomness is passed in so a test can fix it. This ticket also sets the pattern later browser-code tickets reuse: how a module is loaded by the page, and how its tests run without extra tooling.

Origin: architecture review candidate C7.

**Blocked by:** None — can start immediately

**Status:** completed

- [x] Generating and regenerating a schedule (with completed and in-progress Matches locked) goes through the new module, and the page behaves as before
- [x] Tests with a fixed random source check that every player gets at least their game target
- [x] Tests check that nobody plays twice in one Round and no Round needs more Courts than the Tournament has
- [x] Tests check that locked Matches come back unchanged when regenerating
- [x] The tests run with one command and need nothing installed beyond Node
- [x] The scheduler no longer lives inside the main app script
