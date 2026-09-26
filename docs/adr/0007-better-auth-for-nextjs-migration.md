---
status: accepted
---

# Use Better Auth for the Next.js application

The Next.js application will use Better Auth for credentials and sessions, with Better Auth tables stored in Supabase PostgreSQL through Drizzle. Staff keep username-and-password sign-in and must have a reachable email for verification and recovery. Visitors verify email ownership through a one-time code. Player accounts that currently sign in by username alone require a separate migration decision after account inventory. Supabase Auth was considered, but Better Auth's username support better fits staff accounts. See [Better Auth's Drizzle adapter](https://better-auth.com/docs/adapters/drizzle), [Next.js integration](https://better-auth.com/docs/integrations/next), and [username plugin](https://better-auth.com/docs/plugins/username).

## Consequences

- Better Auth owns credential checks and sessions. PaddlePointer owns roles, active status, action permissions, and the optional link from an account to a distinct Player record. The Next.js server checks both the current session and current authorization data for every protected operation.
- Restrict email OTP send and sign-in to Visitor identities, and assign new OTP accounts only the Visitor role. Better Auth's OTP sign-in can otherwise authenticate a staff email and remove its password; the two sign-in paths need server-side guards. A transactional email service is required. See [email OTP](https://better-auth.com/docs/plugins/email-otp).
- Preserve the current staff 12-hour sliding session (refresh when fewer than six hours remain) and the 30-day non-sliding Visitor session through an explicit role-aware policy. Better Auth's global session defaults do not implement this distinction. Revoke sessions on deactivation, deletion, password reset, and role change. Replace browser-stored bearer tokens with server-validated, secure, HTTP-only cookies. See [session management](https://better-auth.com/docs/concepts/session-management).
- Inventory staff email and password-hash compatibility before import. Legacy sessions are not migrated. Player account access remains disabled until the inventory establishes a safe transition from username-only sign-in.
