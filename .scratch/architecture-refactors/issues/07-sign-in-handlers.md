# 07 — Sign-in actions go through handlers

**What to build:** Signing in through the Admin, Player and Visitor portals, signing out, and checking the current session all behave exactly as they do today. They go through handlers, following 03's pattern, with tests. Account management actions are left for 08.

Origin: architecture review candidate C8. Player and Visitor sign-in without a password stays as it is; the separate auth security review decides whether that changes.

**Blocked by:** 03 — Saving a Game goes through a handler tests can call

**Status:** ready-for-agent

- [ ] Login, visitor login, logout and "who am I" behave the same over HTTP
- [ ] Test: Admins and Super Admins need the right password, and inactive accounts are refused (401)
- [ ] Test: visitor login needs a valid email, creates the Visitor on first use, and refuses an email that belongs to another account type (409)
- [ ] Test: signing out ends the session, so "who am I" then returns no user
