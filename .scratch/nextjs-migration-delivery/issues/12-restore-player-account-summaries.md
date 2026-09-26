# 12: Restore Player account summaries

**What to build:** As a Player with an account, I want to sign in and see my own Match summaries, so that my Player identity and results remain accessible after migration.

**Blocked by:** 02 Inventory legacy accounts and migration prerequisites; 03 Sign in with Better Auth and enforce role access; 10 Review History and Leaderboards.

**Status:** ready-for-agent

- [ ] The account transition follows the disposition produced by the legacy account inventory; no Player account is linked by name alone.
- [ ] A Player can access summaries only for the Player record linked to their account.
- [ ] Match summaries use the Player's current name and reflect merged Player identity correctly.
- [ ] Accounts without a safe, verified mapping are not granted access to another Player's records and have a clear recovery path.
- [ ] Browser journeys cover migrated access, unlinked accounts, ownership boundaries, and merged identity behavior.
