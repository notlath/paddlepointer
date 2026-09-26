# 02: Inventory legacy accounts and migration prerequisites

**What to build:** As a migration operator, I want a reviewed inventory of existing accounts and identity relationships, so that staff sign-in and any Player account transition can be migrated without losing access or linking the wrong person.

**Blocked by:** None (can start immediately).

**Status:** done (empty legacy source, operator-attested)

- [x] The inventory distinguishes staff, Player, and Visitor account pathways and documents their existing identifiers and relationships.
- [x] Every staff account is checked for a reachable email address; missing or unusable addresses are listed for resolution before production authentication cutover.
- [x] Existing password-hash compatibility and any required password-reset path are documented and validated against representative accounts.
- [x] Player accounts are inventoried separately from Player records, and the resulting report supports an explicit migration disposition before Player access is implemented.
- [x] The inventory contains no plaintext credentials and is stored or shared with appropriate access controls.

The operator confirmed that both the legacy MySQL source and new Supabase database are empty. There are no real staff accounts, Player accounts, Player records, Visitor accounts, or representative password hashes to inspect; the email, hash, reset, and Player-link checks are therefore not applicable to existing accounts. The [inventory decision](../../../docs/migration/legacy-account-inventory.md) records the source pathways and requirements for new account provisioning. This conclusion is based on operator attestation, not a direct database query; reopen the inventory if real legacy data appears before cutover.
