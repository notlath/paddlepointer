# 08 — Deploy to production on cPanel

**What to build:** Everything from tickets 01–07 running on the production site (www.mtc.com.ph/activities/paddlepoint, on cPanel). Production is currently far behind main: Events, Players, the Leaderboard endpoint, the embed token and every Qlik endpoint are missing there. The app migrates its database on the first request after deploy, so the database is protected first. Needs a human with cPanel access for the backup, secrets and cron steps.

**Blocked by:** 01, 02, 03, 04, 05, 06, 07

**Status:** needs-human

- [ ] Full database backup taken in cPanel before deploying
- [ ] The production database (which may be shared with other MTC apps) is checked for existing `players` and `app_settings` tables belonging to another app; any clash is resolved before deploying
- [ ] Deployed outside Event hours; the first request's migrations complete and the health check passes
- [ ] The production environment file has fresh values (not copies of dev) for the analytics key and the reload trigger URL and execution token, plus the Qlik OAuth credentials; the tenant API key is never placed on the server
- [ ] The production origin is added to the Qlik OAuth client's allowed origins, and the Analytics view loads for a staff account
- [ ] The per-minute cron job from ticket 03 is added in cPanel, and a test write produces a reload
- [ ] Environment files, git metadata and the scratch folder are still not served (403/404)
- [ ] `curl -I https://www.mtc.com.ph/activities/paddlepoint/` shows `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Content-Security-Policy: frame-ancestors 'none'`, `Referrer-Policy: strict-origin-when-cross-origin`, and `Strict-Transport-Security: max-age=31536000`

## Deploy notes from ticket 03

cPanel cron job (Cron Jobs, once per minute; adjust the paths to the account's home directory and its PHP binary, `which php` in cPanel Terminal):

```
* * * * * /usr/local/bin/php /home/<cpanel-user>/public_html/activities/paddlepoint/api/qlik/run-pending-reload.php >/dev/null 2>&1
```

It prints "Qlik reload triggered" or "No reload pending". It reads QLIK_RELOAD_TRIGGER_URL / _TOKEN from the production environment file, and does nothing (the reload stays pending) while those are empty. The web server answers 404 for the file. The 15-minute scheduled Qlik reload automation stays as the backstop.
