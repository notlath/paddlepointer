# 01 — The app can send email

**What to build:** A small email module in `api/` with one function, e.g. `send_email(to, subject, textBody)`, that returns whether the email was sent. This is the app's first outgoing email (ADR 0006). An environment variable picks how mail goes out:
- `smtp`: uses host, port, user, password and from-address from the environment file.
- `log`: for local development. Writes the message to a gitignored file and sends nothing.

If the setting is missing or unknown, the module refuses to send and logs why, so production never falls back to `log` by accident. Plain text only. The `smtp` transport may use a vendored copy of PHPMailer under `vendor/`, like d3; the project has no Composer. Handlers get the send function passed in, the same way the Qlik reload trigger does, so tests can use a stub.

**Mail host (answered 2026-09-25):** mtc.com.ph mail is hosted on cPanel, the same server as the app. Try cPanel's local SMTP (or PHP `mail()`, which cPanel's exim DKIM-signs for hosted domains) before vendoring PHPMailer.

**Blocked by:** None — can start immediately.

**Status:** deferred — the user parked this track on 2026-09-25; Visitors stay passwordless for now.

- [ ] With `log` selected, a sent email appears in the gitignored log file with to, subject and body
- [ ] With `smtp` selected and valid settings, an email reaches a real inbox (checked by hand once)
- [ ] With the setting missing or unknown, nothing is sent, the function reports failure and the reason is logged
- [ ] Passwords and email bodies never appear in error logs
- [ ] `.env.example` lists the new variables, all blank
