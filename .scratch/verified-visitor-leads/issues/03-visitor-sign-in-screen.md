# 03 — Visitor sign-in screen: Company Email, Sign-in code, consent

**What to build:** The Visitor portal's sign-in becomes two steps (ADR 0006):

1. **Company Email**
   - The field is labelled "Company Email", with placeholder `you@company.com`, and the validation message uses the same example.
   - Below it is an optional, unticked checkbox. The wording is a placeholder until ticket 06 approves it, e.g. "MTC may contact me about its products and events", with a link to MTC's privacy notice.
   - Pressing Send code calls request-code and moves to step 2.
2. **Sign-in code**
   - Says which email the code went to.
   - Has a 6-digit field with `autocomplete="one-time-code"` and `inputmode="numeric"`.
   - Has Resend code, disabled for 60 seconds after each send, and a "Use a different email" link back to step 1.
   - Wrong-code, expired and too-many-requests errors appear inline, following the sign-in form's existing error pattern.

The session module no longer signs Visitors back in on its own (today `session.js` calls `visitor-login` with the stored email). When a Visitor's session ends, they see step 1 with their email filled in. Admin and Player portals are unchanged.

**Blocked by:** 02

**Status:** ready-for-agent

- [ ] The Visitor portal shows "Company Email"; Admin and Player portals still show "Username"
- [ ] The consent checkbox is unticked on load and is not required to continue
- [ ] Send code goes to the code step; the code step names the email
- [ ] A correct code signs in and lands where Visitor sign-in lands today; the consent choice is sent with it
- [ ] Wrong, expired and rate-limited errors show inline, and focus moves to the code field
- [ ] Resend is disabled for 60 s after each send
- [ ] A stored Visitor identity with no valid session never triggers a sign-in request without a code
- [ ] Browser tests cover both steps with a fake request function, as `tests/session.test.js` does
