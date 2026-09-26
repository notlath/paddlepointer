# 08 — One User accounts module behind account management

**What to build:** Listing users, editing a profile, and creating, updating and deleting users all go through one User accounts module on the server, so every action applies the same account rules. Today the password rules are written three times and disagree. The rule to apply everywhere: Admins and Super Admins need a password of at least 6 characters; Players and Visitors have no password, and none is stored for them.

Origin: architecture review candidate C11.

**Blocked by:** 07 — Sign-in actions go through handlers

**Status:** ready-for-agent

- [ ] All five actions behave as before, except where they broke the password rule above
- [ ] Test (role × password table): an Admin password under 6 characters is refused on create, profile and update, and a Player or Visitor never gets a password stored on any action
- [ ] Test: the Super Admin can't be demoted, can't be deleted, and can't deactivate their own account
- [ ] Test: a duplicate username is refused (409)
- [ ] Test: only a Super Admin can list, create, update or delete users
