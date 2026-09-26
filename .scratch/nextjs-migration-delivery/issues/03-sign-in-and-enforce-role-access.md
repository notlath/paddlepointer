# 03: Sign in with Better Auth and enforce role access

**What to build:** As a staff member or Visitor, I want to sign in through the appropriate verified account flow and have my role enforced throughout the application, so that I can reach my permitted work and private data remains protected.

**Blocked by:** 01 Deploy the Next.js foundation; 02 Inventory legacy accounts and migration prerequisites.

**Status:** ready-for-agent

- [ ] Staff can sign in with username and password using Better Auth, with a reachable email available for verification and recovery.
- [ ] Visitors verify email ownership by one-time code before accessing Visitor data.
- [ ] Session creation, refresh, expiry, and sign-out produce the expected user-visible behavior for each supported role.
- [ ] Protected reads and writes are authorized on the server using role and record ownership; direct browser database access is not used.
- [ ] Unauthorized users cannot perform protected actions by calling a server endpoint directly.
- [ ] Browser journeys and email-verification contract checks cover successful, expired, invalid, and unauthorized flows.
