# 05 — Make account forms submit and validate in context

**What to build:** Super Admin account creation and profile editing provide form submission, field-level validation, pending feedback, and predictable focus behavior without relying on a transient global message.

Origin: UI/UX audit finding U-03, limited to account-management forms.

**Blocked by:** None (can start immediately)

**Status:** completed

- [x] Account creation and profile editing can be submitted from the keyboard
- [x] Required-field and format errors appear beside the responsible fields and are announced
- [x] The first invalid field receives focus while all other entered values remain intact
- [x] Role-dependent password requirements are stated before submission and validated consistently
- [x] A pending save prevents duplicate requests and identifies the action in progress
- [x] Success feedback is announced without unexpectedly moving the user away from the edited account context
- [x] Existing authorization rules and server-side validation remain authoritative
