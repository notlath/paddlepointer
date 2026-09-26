# 14 — One Match lifecycle module decides every Match change

**What to build:** Starting, score-syncing, completing and unlocking a tournament Match, and saving a schedule that touches Matches, all behave as they do today. But both tournament endpoints now ask one Match lifecycle module on the server to decide every Match transition, lock and score-cleaning rule. Today those rules are written separately in each endpoint and in the browser, and they've already drifted: one endpoint caps scores at 2 digits, the other doesn't.

Origin: architecture review candidate C2.

**Blocked by:** 04 — Tournament Match updates go through a handler with lock-conflict tests; 05 — Saving, reading and resetting a Tournament go through handlers

**Status:** ready-for-agent

- [ ] Both tournament endpoints decide Match transitions through the module, and neither keeps its own copy of the rules
- [ ] Scores are cleaned the same way whichever endpoint saves them: digits only, at most 2
- [ ] Every lock-conflict test from 04 and 05 still passes
- [ ] Module tests pass in a Match and a requested change, and get back the updated Match or a conflict, with no database needed
