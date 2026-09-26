Type: grilling
Status: resolved

Decision: Use Better Auth as the sole owner of credentials and database-backed sessions, stored in Supabase PostgreSQL through Drizzle. Keep PaddlePointer roles, active status, permissions, and Player links in application-owned records. Staff sign in by username and password after their reachable email is collected and verified; Visitors sign in by email OTP. Do not activate legacy Player accounts until the account inventory determines their transition. See [ADR 0007](../../../docs/adr/0007-better-auth-for-nextjs-migration.md).

## Question

How should the new system represent and authenticate staff, player, and visitor accounts while preserving current sign-in flows, permissions, session duration/refresh behavior, and player-account links? Decide whether Supabase Auth should own identities, PaddlePointer should retain a custom identity/session layer, or the two should be combined, and define the security boundary for each role.

## Preservation contract

- A Better Auth user identifies an account, not a Player. Keep a stable legacy-account-to-new-account mapping during import. A Player remains a separate domain record; an account links to at most one Player, and a Player needs no account. Visitor Match participants never become Players through sign-in.
- Super Admin and Admin retain username/password sign-in. Better Auth's username plugin extends its email/password authenticator; every staff account also needs a unique, reachable, verified email for recovery. Inventory missing emails and legacy PHP password hashes before cutover. Import hashes only if verified compatible with Better Auth; otherwise require a controlled password reset. Do not import legacy session tokens.
- Visitors prove email ownership with a one-time sign-in code before an account is created or a session is issued. Only Visitor identities may use the OTP sign-in route, including its send and verify steps. Block a staff email before issuing a code and before consuming one; the Better Auth OTP plugin can otherwise sign in an existing password account and remove its password. New OTP-created accounts must receive only the Visitor role. Keep Visitor history scoped to that account, and keep Visitor Matches outside Events and Player standings.
- Preserve staff sign-in failure throttles by username (five failures per 15 minutes) and IP (30 failures per 15 minutes), plus the Visitor account-creation cap by IP (60 per hour). Bound OTP sends, resends, and verification attempts by address and IP so the new email flow cannot flood recipients or permit unlimited code guesses; choose and test those new thresholds with the email provider before release.
- Legacy Player accounts currently sign in by username without a password. That is not proof of identity. Inventory these accounts and links separately and decide their upgrade path before enabling Player sign-in in the new application. No username-only Player session is accepted after cutover.
- Keep the current session behavior as acceptance criteria: staff sessions expire after 12 hours and refresh to another 12 hours on use when fewer than six hours remain; Visitor sessions expire after 30 days without sliding refresh. Apply the same rule to Player sessions if and when Player access is approved. Better Auth's `expiresIn` and `updateAge` are global settings, so implement and test the role-specific policy explicitly; do not assume its defaults reproduce it. Use server-validated, secure, HTTP-only session cookies instead of browser-stored bearer tokens. Sign-out, deactivation, deletion, password reset, and role changes must revoke affected sessions; role and active-state checks must use current server data.
- The Next.js server validates the Better Auth session and then applies PaddlePointer's action permissions on every protected read and write. UI visibility is only a presentation concern. Staff-only account management and analytics remain staff-only; Visitor reads and writes are restricted to the signed-in Visitor's own data. No browser receives database credentials or privileged Supabase access.

## Why this owner

Supabase Auth would add a second identity model while staff username sign-in still needs an application layer. Keeping the PHP token/session layer would carry its security and maintenance burden into Next.js. Better Auth supports username/password, email OTP, database sessions, and a Drizzle adapter in one owner; PaddlePointer remains the authority for domain roles and ownership. This separates authentication from domain authorization without splitting credential ownership.

## Delivery gates

- Inventory real staff email and password-hash compatibility, plus every Player account and Player link, before importing accounts or enabling production authentication.
- Prove staff username sign-in, email verification/recovery, OTP send and verify role gates, sign-in and OTP abuse limits, Visitor isolation, session expiry/refresh, revocation, and server-side permission checks with browser and boundary tests.
- Configure a transactional email provider before Visitor access is released.

Sources: [Better Auth username plugin](https://better-auth.com/docs/plugins/username), [email OTP](https://better-auth.com/docs/plugins/email-otp), [session management](https://better-auth.com/docs/concepts/session-management), [Drizzle adapter](https://better-auth.com/docs/adapters/drizzle).
