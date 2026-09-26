# 02: Inventory legacy accounts and migration prerequisites

**What to build:** As a migration operator, I want a reviewed inventory of existing accounts and identity relationships, so that staff sign-in and any Player account transition can be migrated without losing access or linking the wrong person.

**Blocked by:** None (can start immediately).

**Status:** ready-for-agent

- [ ] The inventory distinguishes staff, Player, and Visitor account pathways and documents their existing identifiers and relationships.
- [ ] Every staff account is checked for a reachable email address; missing or unusable addresses are listed for resolution before production authentication cutover.
- [ ] Existing password-hash compatibility and any required password-reset path are documented and validated against representative accounts.
- [ ] Player accounts are inventoried separately from Player records, and the resulting report supports an explicit migration disposition before Player access is implemented.
- [ ] The inventory contains no plaintext credentials and is stored or shared with appropriate access controls.
