# 02 — Rate limits on sign-in and saving, and a request size cap (F6)

**What to build:** Nothing throttles anything today. Admin passwords can be guessed without limit (6-character minimum). Visitor sign-in creates accounts and session rows for any email. `save-game.php` stores a JSON body of any size in a LONGTEXT column. The approved approach is a small **MySQL-backed** limiter, so it works across several servers, plus a body cap.

**Limiter**
- Migration `012_rate_limits`: table `rate_limits (bucket VARCHAR(191) PRIMARY KEY, window_start DATETIME NOT NULL, hits INT NOT NULL)`.
- `hit_rate_limit(PDO $pdo, string $bucket, int $max, int $windowSeconds): bool` returns true when over the limit. It is a fixed window in one atomic statement:
  ```sql
  INSERT INTO rate_limits (bucket, window_start, hits) VALUES (:b, NOW(), 1)
  ON DUPLICATE KEY UPDATE
    hits = IF(window_start < NOW() - INTERVAL :w SECOND, 1, hits + 1),
    window_start = IF(window_start < NOW() - INTERVAL :w SECOND, NOW(), window_start)
  ```
  Keep `hits` before `window_start`: MySQL applies the assignments left to right, so `hits` must see the old `window_start`. Then read `hits`.
- Delete rows older than a day now and then, e.g. inside `create_session` next to the expired-session purge.

**Where the limits apply.** Numbers are starting points; keep them as named constants. At an event, many phones share the venue's one public IP, so limits keyed only by IP must be generous. Username limits count **failed** attempts only.
- Staff password failure (`sign_in()` wrong password): at most 5 per username per 15 minutes, and 30 per IP per 15 minutes. Over the limit → 429 `Too many attempts. Try again in a few minutes.` with a `Retry-After` header. Check the limit **before** `password_verify`, so a locked-out username can't keep guessing.
- Visitor sign-in that **creates** a new Visitor: at most 60 per IP per hour. Re-sign-ins of existing Visitors are not counted.
- `save-game.php`: at most 30 per signed-in user per minute.

**Body cap:** `save-game.php` refuses a body over 512 KB with 413, and a Game with more than 5,000 Rally events with 400. A Match to 11 has roughly 50–150 Rallies.

**Client IP:** use `$_SERVER['REMOTE_ADDR']`. Production is cPanel with nginx in front; before going live, confirm on production (the deploy ticket) that `REMOTE_ADDR` is the visitor's IP and not `127.0.0.1`. If it is the proxy, trust `X-Forwarded-For`'s first address **only** when `REMOTE_ADDR` is `127.0.0.1`. Put that in one `client_ip()` function.

Handlers don't see the request (their interface is `(PDO, ?user, data)`). Pass the IP into `sign_in()` / `visitor_sign_in()` as a parameter, and do the body cap and save limit in `save-game.php`.

**Blocked by:** None — can start immediately.

**Status:** ready-for-agent

- [ ] Migration 012 creates `rate_limits`; `tests/schema_test.php` still passes for empty and existing databases
- [ ] `hit_rate_limit` allows `max` hits, refuses the next, and allows again after the window (test with a 1-second window)
- [ ] The 6th wrong password for one username within 15 minutes is 429 with `Retry-After`, even with the right password; other usernames are unaffected
- [ ] Correct sign-ins and Player/Visitor re-sign-ins never count toward any limit
- [ ] The 61st new Visitor from one IP within an hour is 429; existing Visitors can still sign in
- [ ] save-game: 31st save in a minute by one user is 429; a body over 512 KB is 413; over 5,000 events is 400
- [ ] The sign-in screen shows the 429 message inline, like other sign-in errors
- [ ] `client_ip()` ignores `X-Forwarded-For` unless `REMOTE_ADDR` is `127.0.0.1`
