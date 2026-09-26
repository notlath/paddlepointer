# 07 — Production mailbox and email DNS

**What to build:** A sending mailbox for production, e.g. `paddlepoint@mtc.com.ph` or `no-reply@mtc.com.ph`. Its settings go in the production environment file only, never in git. The domain's SPF and DKIM records (and DMARC if MTC uses it) must allow the chosen sender, so Sign-in codes reach the inbox and not spam. Which mail host this uses follows from the answer in ticket 01.

**Blocked by:** 01

**Status:** needs-human

- [ ] Mailbox created; its SMTP settings are in the production environment file with the transport set to `smtp`
- [ ] A test code reaches Gmail and Outlook inboxes (not spam), and the headers show SPF and DKIM pass
- [ ] The mailbox password exists only in the production environment file and a password manager
- [ ] Blocks the production deploy of this track
