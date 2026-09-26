# 03 — Make sign-in validation contextual and keyboard friendly

**What to build:** Each sign-in portal behaves as a real form: users can submit with Enter, receive errors next to the field that needs attention, and are moved to the first invalid field. Server failures remain announced and visible long enough to act on.

Origin: UI/UX audit finding U-03, limited to the sign-in journey.

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

- [ ] Pressing Enter from a sign-in field submits the active Admin, Player, or Visitor form
- [ ] Missing username, email, or password errors appear beside the responsible field
- [ ] Invalid visitor email errors are programmatically associated with the email field
- [ ] Invalid fields expose their error state to assistive technology and receive focus after submission
- [ ] A pending sign-in prevents duplicate submissions and communicates that work is in progress
- [ ] Authentication failures are announced without clearing valid user-entered values
- [ ] Successful sign-in continues into the correct role experience
