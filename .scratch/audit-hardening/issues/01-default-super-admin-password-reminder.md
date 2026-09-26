# 01 — The Super Admin is reminded while the default password is still in use (F5)

**What to build:** Every fresh database is seeded with the Super Admin `superadmin_ac` and a default password. Its bcrypt hash is committed in `ensure_default_admin()` in `api/schema.php` (migration `004_seed_super_admin`).

**User decision (2026-09-25):** keep the default credentials on a fresh database; the Super Admin changes them later. So nothing is forced. The Super Admin can already change their password in the Profile view (Super Admin only; `data-profile-field="password"` in `app.js`, saved by `update_profile()` in `api/accounts.php`). What's missing is a reminder.

1. Move the seeded hash into a named constant (e.g. `DEFAULT_SUPER_ADMIN_PASSWORD_HASH`) that `ensure_default_admin()` uses. Don't change its value; shipped migrations must behave the same.
2. `who_am_i()` and the sign-in payload (`user_payload_with_token()` in `api/sign_in.php`) add `usingDefaultPassword: true` only when the signed-in user is the Super Admin and their stored `password_hash` still equals that constant. Every other user gets `false` or no field. Never send the hash.
3. While that is true, the Super Admin's home dashboard shows a warning banner: "You're still using the default password. Change it in Profile.", linking to the Profile view. It follows the app's existing notice styles. It disappears after the password is changed. Update the stored session/permissions payload after the Profile save, or re-fetch "who am I".

Changing the username is not in scope; the user asked only for "configure later", and the password is what protects the account.

**Blocked by:** None — can start immediately.

**Status:** ready-for-agent

- [ ] A fresh database still seeds `superadmin_ac` with the same default hash (`tests/schema_test.php` still passes)
- [ ] Sign-in and "who am I" report `usingDefaultPassword: true` for the Super Admin with the default hash, and `false` after `update_profile` sets a new password
- [ ] No other role ever gets `true`, and the payload never contains a password hash
- [ ] The dashboard banner shows for the Super Admin with the default password, links to Profile, and is gone after the change
- [ ] PHP tests cover the flag; a node test covers the banner's render condition
