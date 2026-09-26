# 03 — Content Security Policy, security headers, and shorter staff sessions (F9)

**What to build:** Session tokens, including the Super Admin's, sit in `localStorage` for 30 days, and no security headers are sent. So any script injection becomes a full account takeover. Commit 811d728 fixed the known XSS sinks. This ticket limits the damage from any future one.

**1. Content Security Policy.** Add it as a `<meta http-equiv="Content-Security-Policy">` in `index.html`, which works on any server, including local nginx and `php -S`:
```
default-src 'self';
script-src 'self' https://cdn.jsdelivr.net;
style-src 'self' 'unsafe-inline' https://fonts.googleapis.com;
font-src 'self' https://fonts.gstatic.com;
img-src 'self' data: blob:;
connect-src 'self' https://mtcmarketing.sg.qlikcloud.com wss://mtcmarketing.sg.qlikcloud.com;
base-uri 'self'; form-action 'self'; object-src 'none'
```
Where these sources come from:
- `index.html` loads Google Fonts CSS and local scripts, including `vendor/d3-7.9.0.min.js`.
- `qlik-mashup.js` imports `https://cdn.jsdelivr.net/npm/@qlik/api@2.16.0/qix.js` and talks to the Qlik tenant (`QLIK_HOST`).
- `style-src 'unsafe-inline'` is needed because `qlik-mashup.js:388` writes `style="width: …%"` in HTML. Inline `<script>` stays blocked, which is what matters.

Verify in a browser with a signed-in staff account on the Analytics view and on the Live Board: the console must show **no** CSP violations. If Qlik needs another source (a worker, `blob:` script, another host), add exactly that and say why in a comment.

**2. Headers.** Send these from a new root `.htaccess`, which cPanel's Apache reads (`api/.htaccess` already uses `mod_headers`), and add `nosniff` to `send_json()`:
- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY` and `Content-Security-Policy: frame-ancestors 'none'` (header only; `frame-ancestors` is ignored in a meta tag)
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Strict-Transport-Security: max-age=31536000` (HTTPS only)

Local Herd is nginx, so `.htaccess` can't be tested locally. Add to the deploy ticket (`.scratch/fresh-leaderboard-and-production/issues/08-deploy-to-production.md`) a check that `curl -I https://www.mtc.com.ph/activities/paddlepoint/` shows these headers.

**3. Shorter staff sessions.** Admin and Super Admin sessions expire after **12 hours of inactivity**; Players and Visitors keep 30 days.
- `create_session()` in `api/sign_in.php` sets the expiry by role.
- `user_from_request()` in `api/db.php` extends a staff session to NOW()+12 h, but only when less than 6 h remain. That's at most one UPDATE per 6 hours per session, not one per request.
- In the browser, a staff member whose session expired gets the Admin sign-in screen with a short "Your session ended. Sign in again." notice, not a broken view. Check how `session.js` handles a 401 today; Players and Visitors are signed back in silently.

**Blocked by:** None — can start immediately.

**Status:** ready-for-agent

- [ ] `index.html` carries the CSP; Analytics (charts load, selections work) and the Live Board run with zero CSP violations in the console
- [ ] An injected `<script>` or `onerror` attribute in rendered HTML is blocked (check once in the browser with a test string)
- [ ] Root `.htaccess` sets the four headers; `send_json()` adds `nosniff`; the deploy ticket has the `curl -I` check
- [ ] A new staff session expires 12 h after sign-in; use within the last 6 h extends it to 12 h from now; a Player/Visitor session still lasts 30 days
- [ ] PHP tests cover staff vs Player expiry and the extension; the expiry test moves `expires_at` in the DB rather than waiting
- [ ] An expired staff session lands on the Admin sign-in with the notice
