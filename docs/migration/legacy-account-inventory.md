# Legacy account inventory: empty source

**Decision (2026-09-26):** The operator confirmed that the legacy MySQL database has no real accounts or Player records to migrate. The new Supabase database is also empty. No production database credentials or export were provided, so this is an operator-attested inventory, not an independently queried count. Recheck the source before any later cutover if the PHP application begins accepting real data.

| Legacy pathway | Identifier and relationship in the PHP schema | Inventory disposition |
| --- | --- | --- |
| Super Admin / Admin | `users.id`, unique `users.username`, role, active state, and `password_hash`. There is no staff email column. | No real staff accounts to migrate or email addresses to repair. Provision each new staff account with a unique, reachable, verified email and a new password before activation. |
| Player account | A `users` row with role `player`; optional `users.player_id` links to a distinct `players.id`. The PHP sign-in currently accepts a username without a password. | No Player accounts or Player records to link or upgrade. Do not enable username-only Player sign-in in Next.js. |
| Visitor account | A `users` row with role `visitor`; `username` is an email address, but the PHP pathway does not prove ownership. Visitor Match ownership uses the account ID, not a Player record. | No Visitor accounts or history to import. New Visitors must prove email ownership through the planned OTP flow. |

The PHP schema seeds a default Super Admin row when its migrations run. That seed is a bootstrap fixture, not a real account for migration. Do not copy its hash or session into Better Auth. Provision the first Next.js Super Admin through a controlled setup step with a verified email and a newly chosen password.

PHP creates staff hashes with `password_hash(..., PASSWORD_DEFAULT)` and verifies them with `password_verify()`. The repository's seeded Super Admin hash is bcrypt; [Better Auth defaults to scrypt and supports custom password verification](https://better-auth.com/docs/authentication/email-password). There are no real staff hashes or representative accounts to validate, so hash import and a legacy-password reset campaign are **not applicable** under this empty-source decision. New accounts should use Better Auth's native password handling. If legacy accounts appear before cutover, reopen this inventory, verify the hash schemes on representative accounts, confirm each staff email, choose an import or reset path, and review every Player-account link before enabling access.

This record contains no account names, addresses, hashes, tokens, or plaintext credentials and may be kept in Git. Any future account-level inventory must be stored outside the repository with restricted access.
