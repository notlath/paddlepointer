# 03: Sign in with Better Auth and enforce role access

**What to build:** As a staff member or Visitor, I want to sign in through the appropriate verified account flow and have my role enforced throughout the application, so that I can reach my permitted work and private data remains protected.

**Blocked by:** 01 Deploy the Next.js foundation; 02 Inventory legacy accounts and migration prerequisites.

**Status:** implemented; Preview email activation pending operator Resend setup

- [x] Staff can sign in with username and password using Better Auth, with a reachable email available for verification and recovery.
- [x] Visitors verify email ownership by one-time code before accessing Visitor data.
- [x] Session creation, refresh, expiry, and sign-out produce the expected user-visible behavior for each supported role.
- [x] Protected reads and writes are authorized on the server using role and record ownership; direct browser database access is not used.
- [x] Unauthorized users cannot perform protected actions by calling a server endpoint directly.
- [x] Browser journeys and email-verification contract checks cover successful, expired, invalid, and unauthorized flows.

The implementation and local browser tests are complete. The [isolated Preview](https://paddlepointer-next-preview-9kyxygpm3-lathrells-projects.vercel.app) is deployed; its protected health endpoint reports a connected database, and its unauthenticated session endpoint returns `null`. The disposable Supabase Preview has the auth tables, timezone-aware timestamps, session-revocation trigger, and RLS enabled. `BETTER_AUTH_SECRET` is set in Vercel Preview; the deployment URL supplies the auth origin. Live Preview sign-in still requires a verified Resend sender, `RESEND_API_KEY`, `AUTH_EMAIL_FROM`, and the first staff bootstrap. Run `next-app/scripts/setup-auth-email.sh` for the email steps, then redeploy and verify delivery before treating Preview authentication as live.
