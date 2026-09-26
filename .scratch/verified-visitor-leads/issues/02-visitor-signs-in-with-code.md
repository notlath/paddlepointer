# 02 — Visitors sign in with an emailed Sign-in code (server)

**What to build:** Two new actions replace today's `visitor-login`, which issues a session for any email without checking it (ADR 0006; CONTEXT.md: Visitor, Sign-in code):

1. **request-code** `{ email }`
   - Checks the email is valid. Any valid email is accepted; "Company Email" is only a label.
   - Emails a 6-digit Sign-in code using the email module from ticket 01.
   - Stores only a hash of the code, with an expiry 10 minutes out.
   - Refuses an email that belongs to another account type, as today.
   - Replies the same way whether or not a Visitor with that email exists.
2. **verify-code** `{ email, code, displayName, marketingConsent }`
   - Allows 5 wrong tries per code; after that the code is dead.
   - A correct code works once. It creates the Visitor on first use, as today, and records when the email was verified.
   - If `marketingConsent` is true, records the consent time and the consent wording version. Nothing is recorded when it is false.
   - Returns the same session payload `visitor-login` returns today.

`visitor-login` then answers 410 with a message to update the app.

Code requests are limited per email (e.g. 3 per 10 minutes) and per IP (e.g. 10 per hour). Count past requests in the codes table; no separate rate-limit module is needed. A migration adds the codes table and the user columns, and deletes all existing Visitor sessions, so every Visitor verifies at their next sign-in. Admin and Player sign-in are unchanged; Players stay username-only.

**Blocked by:** 01

**Status:** ready-for-agent

- [ ] request-code for a valid email sends one code and stores only its hash; an invalid email is 400
- [ ] request-code gives the same reply for a new email and a known Visitor email
- [ ] An email used by an Admin, Super Admin or Player account is refused, as today
- [ ] The 4th request for one email within 10 minutes is refused with 429, and no email is sent
- [ ] verify-code with the right code signs in; the same code a second time is refused
- [ ] A code older than 10 minutes is refused; after 5 wrong tries even the right code is refused
- [ ] First verification creates the Visitor and records the verified time; later ones keep the account
- [ ] Consent true records the time and wording version; consent false records nothing and does not erase earlier consent
- [ ] `visitor-login` answers 410 and creates no session
- [ ] After the migration, every Visitor session from before is gone; other roles' sessions are untouched
- [ ] PHP tests cover the above with a stub email sender
