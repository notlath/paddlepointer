# 04 — Tournament Match updates go through a handler with lock-conflict tests

**What to build:** Starting, score-syncing, completing and unlocking a tournament Match from a scoreboard behave exactly as they do today. They go through a handler, following 03's pattern, whose tests pin down the Match lock rules before C2 consolidates them.

Origin: architecture review candidate C8, groundwork for C2.

**Blocked by:** 03 — Saving a Game goes through a handler tests can call

**Status:** ready-for-agent

- [ ] All four update intents behave the same over HTTP
- [ ] Test: a completed Match can only be completed again by the same Game; anything else is refused (409)
- [ ] Test: an in-progress Match refuses updates from a different Game, "already ongoing on another scoreboard" (409)
- [ ] Test: completing a Match that was never started is refused (409)
- [ ] Test: completing without a winner infers it from the score, and a tied score is refused (409)
- [ ] Test: an unknown Tournament or Match returns 404, and anyone who isn't staff is refused
