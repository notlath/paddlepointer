# 26 — An Access policy module on the server

**What to build:** Every endpoint asks one Access policy module on the server whether the signed-in user may do what they're asking, instead of comparing role names itself. What each role may do stays exactly as it is today. The policy's answer for the current session is included in the "who am I" response, for 27 to use.

Origin: architecture review candidate C6, rated Speculative. It earns its keep when a fifth role arrives.

**Blocked by:** 03 — Saving a Game goes through a handler tests can call; 04 — Tournament Match updates go through a handler with lock-conflict tests; 05 — Saving, reading and resetting a Tournament go through handlers; 06 — History goes through a handler with visibility tests per role; 07 — Sign-in actions go through handlers; 08 — One User accounts module behind account management

**Status:** ready-for-agent

- [ ] No endpoint compares role names itself
- [ ] Every handler test from 03–08 still passes, so permissions are unchanged
- [ ] A role × action table test covers every action for Super Admin, Admin, Player, Visitor and signed-out requests
- [ ] The "who am I" response includes what the session is allowed to do
