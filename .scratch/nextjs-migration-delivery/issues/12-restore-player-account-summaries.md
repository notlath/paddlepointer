# 12: Restore Player account summaries

**What to build:** As a Player with an account, I want to sign in and see my own Match summaries, so that my Player identity and results remain accessible after migration.

**Blocked by:** 02 Inventory legacy accounts and migration prerequisites; 03 Sign in with Better Auth and enforce role access; 10 Review History and Leaderboards.

**Status:** implemented; local database browser verification pending

- [x] The account transition follows the disposition produced by the legacy account inventory; no Player account is linked by name alone.
- [x] A Player can access summaries only for the Player record linked to their account.
- [x] Match summaries use the Player's current name and reflect merged Player identity correctly.
- [x] Accounts without a safe, verified mapping are not granted access to another Player's records and have a clear recovery path.
- [x] Browser journeys cover migrated access, unlinked accounts, ownership boundaries, and merged identity behavior.

The source inventory is empty, so there are no real Player accounts to migrate. New Player accounts are provisioned against an explicitly reviewed Player ID, remain unverified until email verification, and cannot use legacy username-only sign-in. The browser journey is implemented but needs a disposable local PostgreSQL database to execute.
